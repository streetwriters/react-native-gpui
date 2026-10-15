// Generates the Rust glue a TurboModule library implements: one trait per spec
// file, the events handle, the value structs and enums, and the descriptor that
// registers the module with `rn-gpui-module`.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/// `@react-native/codegen` belongs to the app, not to this package, so it is
/// resolved from the spec being generated and then from here.
function loadTypeScriptParser(hints) {
  const failures = [];
  for (const hint of hints) {
    try {
      const require = createRequire(hint);
      return require('@react-native/codegen/lib/parsers/typescript/parser.js')
        .TypeScriptParser;
    } catch (error) {
      failures.push(`${hint}: ${error.message}`);
    }
  }
  throw new Error(
    `generate-rust-spec: cannot resolve @react-native/codegen; install it in the app.\n${failures.join('\n')}`,
  );
}

const RUST_KEYWORDS = new Set([
  'as',
  'break',
  'const',
  'continue',
  'crate',
  'dyn',
  'else',
  'enum',
  'extern',
  'false',
  'fn',
  'for',
  'if',
  'impl',
  'in',
  'let',
  'loop',
  'match',
  'mod',
  'move',
  'mut',
  'pub',
  'ref',
  'return',
  'self',
  'Self',
  'static',
  'struct',
  'super',
  'trait',
  'true',
  'type',
  'unsafe',
  'use',
  'where',
  'while',
  'async',
  'await',
  'dyn',
  'abstract',
  'become',
  'box',
  'do',
  'final',
  'macro',
  'override',
  'priv',
  'try',
  'typeof',
  'unsized',
  'virtual',
  'yield',
]);
const RAW_IDENTIFIER_INVALID = new Set(['crate', 'self', 'super', 'Self']);

export function rustIdentifier(name) {
  if (!RUST_KEYWORDS.has(name)) return name;
  return RAW_IDENTIFIER_INVALID.has(name) ? `${name}_` : `r#${name}`;
}

export function snakeCase(name) {
  return name
    .replaceAll(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/gu, '$1_$2')
    .toLowerCase();
}

export function pascalCase(name) {
  const words = name.split(/[^A-Za-z0-9]+/u).filter(Boolean);
  const joined = words
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join('');
  if (joined.length === 0) return 'Value';
  return /^[0-9]/u.test(joined) ? `V${joined}` : joined;
}

function variantName(name, index) {
  const cleaned = name.replaceAll(/[^A-Za-z0-9]+/gu, ' ').trim();
  if (cleaned.length === 0) return `Value${index}`;
  const variant = pascalCase(cleaned);
  return RUST_KEYWORDS.has(variant) ? `${variant}Value` : variant;
}

const pascal = name => pascalCase(name);

/// A Rust string literal, so generated messages survive quotes in spec values.
const rustString = text => JSON.stringify(text);

class SpecGenerator {
  constructor({ specPath, hasteModuleName, module }) {
    this.specPath = specPath;
    this.hasteModuleName = hasteModuleName;
    this.module = module;
    this.spec = module.spec;
    this.aliasMap = module.aliasMap ?? {};
    this.enumMap = module.enumMap ?? {};
    // Anonymous object types and string literal unions are named after the
    // place they appear, so the same shape is generated once.
    this.anonymous = new Map();
    this.types = [];
    this.typeNames = new Set();
  }

  fail(where, detail) {
    throw new Error(`${this.specPath}: ${where}: ${detail}`);
  }

  /// The name JS asks for. The Rust names come from the spec file instead.
  get moduleName() {
    return this.module.moduleName ?? this.hasteModuleName;
  }

  get stem() {
    return path.basename(this.specPath).replace(/\.[^.]+$/u, '');
  }

  get traitName() {
    return `${this.stem}Spec`;
  }

  get eventsName() {
    return `${this.stem}Events`;
  }

  get instanceName() {
    return `${this.stem}Instance`;
  }

  get descriptorName() {
    const stem = this.stem.replace(/^Native/u, '');
    return `native_${snakeCase(stem)}_module`;
  }

  /// Maps a type annotation to a Rust type, generating a struct or enum when
  /// the annotation names one.
  typeOf(annotation, context) {
    const { where } = context;
    switch (annotation.type) {
      case 'StringTypeAnnotation':
        return 'String';
      case 'NumberTypeAnnotation':
      case 'DoubleTypeAnnotation':
      case 'FloatTypeAnnotation':
        return 'f64';
      case 'Int32TypeAnnotation':
        return 'i32';
      case 'BooleanTypeAnnotation':
        return 'bool';
      case 'VoidTypeAnnotation':
        return '()';
      case 'NullableTypeAnnotation':
        return `Option<${this.typeOf(annotation.typeAnnotation, context)}>`;
      case 'ArrayTypeAnnotation':
        return `Vec<${this.typeOf(annotation.elementType, context)}>`;
      case 'GenericObjectTypeAnnotation':
        return 'Value';
      case 'ArrayBufferTypeAnnotation':
        return 'ArrayBuffer';
      case 'ObjectTypeAnnotation':
        return this.objectType(annotation, context);
      case 'TypeAliasTypeAnnotation': {
        const alias = this.aliasMap[annotation.name];
        if (!alias) this.fail(where, `unknown type alias ${annotation.name}`);
        if (alias.type === 'ObjectTypeAnnotation') {
          return this.objectType(alias, {
            ...context,
            name: annotation.name,
            aliasName: annotation.name,
          });
        }
        if (alias.type === 'EnumDeclaration') {
          return this.enumType(annotation.name, alias);
        }
        this.fail(where, `unsupported type alias ${annotation.name}`);
        break;
      }
      case 'EnumDeclaration': {
        const declared = this.enumMap[annotation.name];
        if (!declared) this.fail(where, `unknown enum ${annotation.name}`);
        return this.enumType(annotation.name, declared);
      }
      case 'UnionTypeAnnotation':
        return this.unionType(annotation, context);
      case 'FunctionTypeAnnotation':
        if (context.callbackAllowed !== true) {
          this.fail(
            where,
            'a method that takes a callback must return void or a Promise',
          );
        }
        return this.callbackType(annotation, context);
      default:
        this.fail(where, `unsupported spec type ${annotation.type}`);
        break;
    }
    return 'Value';
  }

  objectType(annotation, context) {
    if (context.aliasName && this.typeNames.has(context.aliasName)) {
      return context.aliasName;
    }
    const name = this.uniqueName(
      context.aliasName ?? context.name ?? `${pascal(context.where)}Value`,
    );
    // Recursion would need a boxed field, which this generator does not write.
    const nested = annotation.properties ?? [];
    for (const property of nested) {
      if (this.referencesAlias(property.typeAnnotation, context.aliasName)) {
        this.fail(
          context.where,
          `recursive type alias ${context.aliasName ?? name} is not supported`,
        );
      }
    }
    this.typeNames.add(name);
    const fields = nested.map(property => ({
      name: rustIdentifier(snakeCase(property.name)),
      jsName: property.name,
      optional: property.optional === true,
      nullable: property.typeAnnotation.type === 'NullableTypeAnnotation',
      annotation: property.typeAnnotation,
    }));
    const struct = {
      kind: 'struct',
      name,
      fields: fields.map(field => ({
        ...field,
        rustType: this.fieldType(field, { ...context, where: context.where }),
      })),
    };
    // Nested objects are named after their parent, so register the struct
    // before generating the fields that may add more types.
    this.types.push(struct);
    return name;
  }

  fieldType(field, context) {
    const inner = this.typeOf(field.annotation, {
      ...context,
      name: `${context.name ?? ''}${pascal(field.jsName)}`,
      aliasName: undefined,
      callbackAllowed: false,
    });
    if (field.optional) {
      return inner.startsWith('Option<') ? inner : `Option<${inner}>`;
    }
    return inner;
  }

  referencesAlias(annotation, aliasName) {
    if (!aliasName) return false;
    if (annotation.type === 'TypeAliasTypeAnnotation') {
      return annotation.name === aliasName;
    }
    if (annotation.type === 'NullableTypeAnnotation') {
      return this.referencesAlias(annotation.typeAnnotation, aliasName);
    }
    if (annotation.type === 'ArrayTypeAnnotation') {
      return this.referencesAlias(annotation.elementType, aliasName);
    }
    if (annotation.type === 'ObjectTypeAnnotation') {
      return (annotation.properties ?? []).some(property =>
        this.referencesAlias(property.typeAnnotation, aliasName),
      );
    }
    return false;
  }

  uniqueName(base) {
    let name = base;
    let suffix = 2;
    while (this.typeNames.has(name)) {
      name = `${base}${suffix}`;
      suffix += 1;
    }
    this.typeNames.add(name);
    return name;
  }

  unionType(annotation, context) {
    const members = (annotation.types ?? []).map(member => {
      if (member.type !== 'StringLiteralTypeAnnotation') {
        this.fail(context.where, `unsupported union member ${member.type}`);
      }
      return { name: String(member.value), value: member.value };
    });
    if (members.length === 0) this.fail(context.where, 'empty union type');
    const name = this.uniqueName(
      context.name ?? `${pascal(context.where)}Value`,
    );
    this.pushEnum(name, {
      memberType: 'StringTypeAnnotation',
      members: members.map(member => ({
        name: member.name,
        value: { type: 'StringLiteralTypeAnnotation', value: member.value },
      })),
    });
    return name;
  }

  enumType(name, declaration) {
    if (this.typeNames.has(name)) return name;
    this.typeNames.add(name);
    this.pushEnum(name, declaration);
    return name;
  }

  pushEnum(name, declaration) {
    // As React Native's own generator does, anything that is not a string enum
    // is numeric.
    const numeric = declaration.memberType !== 'StringTypeAnnotation';
    const members = (declaration.members ?? []).map((member, index) => {
      const value = member.value?.value ?? member.name;
      if (numeric && typeof value !== 'number') {
        this.fail(
          `enum ${name}`,
          `expected a numeric member for ${member.name}`,
        );
      }
      if (!numeric && typeof value !== 'string') {
        this.fail(
          `enum ${name}`,
          `expected a string member for ${member.name}`,
        );
      }
      return {
        variant: variantName(member.name ?? String(value), index),
        value,
      };
    });
    this.types.push({ kind: 'enum', name, numeric, members });
  }

  callbackType(annotation, context) {
    const args = (annotation.params ?? []).map((parameter, index) => {
      const declared = this.typeOf(parameter.typeAnnotation, {
        where: `${context.where} callback argument ${index}`,
        callbackAllowed: false,
      });
      return parameter.optional && !declared.startsWith('Option<')
        ? `Option<${declared}>`
        : declared;
    });
    return `Box<dyn FnOnce(${args.join(', ')}) + Send>`;
  }

  methods() {
    return (this.spec.methods ?? []).map((method, index) => {
      const signature = method.typeAnnotation;
      const returns = signature.returnTypeAnnotation;
      const where = method.name;
      const kind =
        returns.type === 'VoidTypeAnnotation'
          ? 'void'
          : returns.type === 'PromiseTypeAnnotation'
            ? 'promise'
            : 'value';
      if (method.name === 'getConstants' && kind === 'promise') {
        this.fail(where, 'getConstants cannot return a Promise');
      }
      const callbackAllowed = kind !== 'value';
      const params = (signature.params ?? []).map((parameter, position) => ({
        jsName: parameter.name,
        name: rustIdentifier(snakeCase(parameter.name)),
        annotation: parameter.typeAnnotation,
        optional: parameter.optional === true,
        nullable: parameter.typeAnnotation.type === 'NullableTypeAnnotation',
        position,
        isCallback: parameter.typeAnnotation.type === 'FunctionTypeAnnotation',
      }));
      for (const parameter of params) {
        const declared = this.typeOf(parameter.annotation, {
          where,
          name: `${pascal(method.name)}${pascal(parameter.jsName)}`,
          callbackAllowed,
        });
        parameter.rustType =
          parameter.optional && !declared.startsWith('Option<')
            ? `Option<${declared}>`
            : declared;
        if (parameter.isCallback) {
          parameter.callbackArgTypes = (parameter.annotation.params ?? []).map(
            (callbackArg, argumentIndex) =>
              this.typeOf(callbackArg.typeAnnotation, {
                where,
                name: `${pascal(method.name)}${pascal(parameter.jsName)}Argument${argumentIndex}`,
                callbackAllowed: false,
              }),
          );
        }
      }
      let rustReturn = '()';
      let returnsVoid = false;
      if (kind === 'value') {
        rustReturn = this.typeOf(returns, {
          where,
          name: `${pascal(method.name)}Result`,
          callbackAllowed: false,
        });
      } else if (kind === 'promise') {
        const element = returns.elementType;
        if (element.type === 'VoidTypeAnnotation') {
          returnsVoid = true;
        } else {
          rustReturn = this.typeOf(element, {
            where,
            name: `${pascal(method.name)}Result`,
            callbackAllowed: false,
          });
        }
      }
      // A parameter the spec marks optional may be omitted, so the required
      // count stops after the last one that is not.
      const requiredArgs = params.reduce(
        (required, parameter, position) =>
          parameter.optional ? required : position + 1,
        0,
      );
      return {
        index,
        jsName: method.name,
        requiredArgs,
        name: rustIdentifier(snakeCase(method.name)),
        kind,
        params,
        rustReturn,
        returnsVoid,
        callbackArgs: params
          .filter(parameter => parameter.isCallback)
          .map(parameter => parameter.position),
      };
    });
  }

  events() {
    return (this.spec.eventEmitters ?? []).map(eventEmitter => {
      const annotation = eventEmitter.typeAnnotation.typeAnnotation;
      const hasValue = annotation.type !== 'VoidTypeAnnotation';
      return {
        jsName: eventEmitter.name,
        name: rustIdentifier(snakeCase(eventEmitter.name)),
        hasValue,
        rustType: hasValue
          ? this.typeOf(annotation, {
              where: `event ${eventEmitter.name}`,
              name: `${pascal(eventEmitter.name)}Payload`,
              callbackAllowed: false,
            })
          : null,
      };
    });
  }
}

export function generateRustSpec({ specPaths }) {
  const TypeScriptParser = loadTypeScriptParser([
    ...specPaths.map(specPath => path.resolve(specPath)),
    path.join(process.cwd(), 'package.json'),
    import.meta.url,
  ]);
  const parser = new TypeScriptParser();
  const chunks = [];
  for (const specPath of specPaths) {
    const schema = parser.parseFile(specPath);
    const modules = Object.entries(schema.modules ?? {});
    if (modules.length !== 1) {
      throw new Error(
        `${specPath}: expected exactly one NativeModule, found ${modules.length}`,
      );
    }
    const [hasteModuleName, module] = modules[0];
    if (module.type !== 'NativeModule') {
      throw new Error(
        `${specPath}: expected a NativeModule, found ${module.type}`,
      );
    }
    const generator = new SpecGenerator({ specPath, hasteModuleName, module });
    const methods = generator.methods();
    const events = generator.events();
    chunks.push(renderSpec(generator, methods, events));
  }
  return `${HEADER}\n${chunks.join('\n')}`;
}

const HEADER = `// Generated by @react-native-gpui/codegen from TypeScript specs; do not edit.

use std::sync::Arc;

use rn_gpui_module::__private::{Args, FieldMap, Path};
use rn_gpui_module::{
    ArrayBuffer, EventEmitter, EventInfo, FromValue, IntoValue, LocalBoxFuture, MethodInfo, MethodKind,
    ModuleDescriptor, ModuleError, ModuleInstance, ModuleThread, Value,
};
`;

function renderSpec(generator, methods, events) {
  const lines = [];
  lines.push(`// ${generator.specPath}`);
  lines.push('');
  lines.push(renderEvents(generator, events));
  lines.push(renderTrait(generator, methods));
  lines.push(renderDescriptor(generator, methods, events));
  lines.push(renderInstance(generator, methods));
  for (const type of generator.types) {
    lines.push(type.kind === 'struct' ? renderStruct(type) : renderEnum(type));
  }
  return lines.filter(line => line !== null).join('\n');
}

function renderEvents(generator, events) {
  const lines = [];
  lines.push('#[derive(Clone)]');
  lines.push(`pub struct ${generator.eventsName} {`);
  lines.push('    emitter: EventEmitter,');
  lines.push('}');
  lines.push('');
  lines.push(`impl ${generator.eventsName} {`);
  for (const event of events) {
    if (event.hasValue) {
      lines.push(`    pub fn ${event.name}(&self, value: ${event.rustType}) {`);
      lines.push(
        `        self.emitter.emit(${JSON.stringify(event.jsName)}, Some(value.into_value()));`,
      );
      lines.push('    }');
    } else {
      lines.push(`    pub fn ${event.name}(&self) {`);
      lines.push(
        `        self.emitter.emit(${JSON.stringify(event.jsName)}, None);`,
      );
      lines.push('    }');
    }
    lines.push('');
  }
  lines.push('    pub fn send_event(&self, name: &str, body: Value) {');
  lines.push('        self.emitter.send_event(name, body);');
  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}

function methodSignature(method) {
  const parameters = method.params
    .map(parameter => `${parameter.name}: ${parameter.rustType}`)
    .join(', ');
  switch (method.kind) {
    case 'value':
      return `    fn ${method.name}(&self${parameters ? `, ${parameters}` : ''}) -> Result<${method.rustReturn}, ModuleError>;`;
    case 'void':
      return `    fn ${method.name}(&self${parameters ? `, ${parameters}` : ''});`;
    default:
      return `    async fn ${method.name}(&self${parameters ? `, ${parameters}` : ''}) -> Result<${method.rustReturn}, ModuleError>;`;
  }
}

function renderTrait(generator, methods) {
  const lines = [];
  lines.push('#[allow(async_fn_in_trait)]');
  lines.push(
    `pub trait ${generator.traitName}: Send + Sync + Sized + 'static {`,
  );
  lines.push('    const THREAD: ModuleThread = ModuleThread::Own;');
  lines.push('');
  lines.push(`    fn new(events: ${generator.eventsName}) -> Self;`);
  lines.push('');
  for (const method of methods) {
    lines.push(methodSignature(method));
  }
  lines.push('}');
  return lines.join('\n');
}

function renderDescriptor(generator, methods, events) {
  const lines = [];
  lines.push(
    `pub fn ${generator.descriptorName}<M: ${generator.traitName}>() -> ModuleDescriptor {`,
  );
  lines.push('    ModuleDescriptor {');
  lines.push(`        name: ${JSON.stringify(generator.moduleName)},`);
  lines.push('        thread: M::THREAD,');
  lines.push('        methods: &[');
  for (const method of methods) {
    const kind =
      method.kind === 'value'
        ? 'MethodKind::Value'
        : method.kind === 'void'
          ? 'MethodKind::Void'
          : 'MethodKind::Promise';
    const callbacks = `&[${method.callbackArgs.join(', ')}]`;
    lines.push('            MethodInfo {');
    lines.push(`                name: ${JSON.stringify(method.jsName)},`);
    lines.push(`                arg_count: ${method.params.length},`);
    lines.push(`                required_args: ${method.requiredArgs},`);
    lines.push(`                kind: ${kind},`);
    lines.push(`                returns_void: ${method.returnsVoid},`);
    lines.push(`                callback_args: ${callbacks},`);
    lines.push('            },');
  }
  lines.push('        ],');
  lines.push('        events: &[');
  for (const event of events) {
    lines.push('            EventInfo {');
    lines.push(`                name: ${JSON.stringify(event.jsName)},`);
    lines.push(`                has_value: ${event.hasValue},`);
    lines.push('            },');
  }
  lines.push('        ],');
  lines.push(
    `        create: |events| Arc::new(${generator.instanceName}::<M>::new(events)) as Arc<dyn ModuleInstance>,`,
  );
  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}

function argumentConversion(method, parameter) {
  if (parameter.isCallback) {
    const args = (parameter.annotation.params ?? []).map(
      (callbackArg, index) => `a${index}: ${parameter.callbackArgTypes[index]}`,
    );
    const values = (parameter.annotation.params ?? [])
      .map((_, index) => `a${index}.into_value()`)
      .join(', ');
    return [
      `                let ${parameter.name} = args.next_callback(${JSON.stringify(parameter.jsName)})?;`,
      `                let ${parameter.name}: ${parameter.rustType} =`,
      `                    Box::new(move |${args.join(', ')}| ${parameter.name}.invoke(vec![${values}]));`,
    ];
  }
  return [
    `                let ${parameter.name}: ${parameter.rustType} = args.next(${JSON.stringify(parameter.jsName)})?;`,
  ];
}

function renderInstance(generator, methods) {
  const lines = [];
  lines.push(`struct ${generator.instanceName}<M: ${generator.traitName}>(M);`);
  lines.push('');
  lines.push(`impl<M: ${generator.traitName}> ${generator.instanceName}<M> {`);
  lines.push('    fn new(events: EventEmitter) -> Self {');
  lines.push(
    `        Self(M::new(${generator.eventsName} { emitter: events }))`,
  );
  lines.push('    }');
  lines.push('}');
  lines.push('');
  lines.push(
    `impl<M: ${generator.traitName}> ModuleInstance for ${generator.instanceName}<M> {`,
  );
  for (const kind of ['value', 'void', 'promise']) {
    const matching = methods.filter(method => method.kind === kind);
    lines.push(renderCall(generator, kind, matching));
    lines.push('');
  }
  lines.push('}');
  return lines.join('\n');
}

function renderCall(generator, kind, methods) {
  const name = generator.moduleName;
  const lines = [];
  const signature =
    kind === 'promise'
      ? '    fn call_promise(\n        self: Arc<Self>,\n        method: usize,\n        args: Vec<Value>,\n    ) -> Result<LocalBoxFuture<Result<Value, ModuleError>>, ModuleError> {'
      : kind === 'value'
        ? '    fn call_value(&self, method: usize, args: Vec<Value>) -> Result<Value, ModuleError> {'
        : `    fn prepare_void(\n        self: Arc<Self>,\n        method: usize,\n        args: Vec<Value>,\n    ) -> Result<Box<dyn FnOnce() + Send + 'static>, ModuleError> {`;
  lines.push(signature);
  lines.push('        match method {');
  for (const method of methods) {
    lines.push(`            ${method.index} => {`);
    lines.push(
      `                let mut args = Args::new(${JSON.stringify(name)}, ${JSON.stringify(method.jsName)}, args);`,
    );
    for (const parameter of method.params) {
      lines.push(...argumentConversion(method, parameter));
    }
    const call = `self.0.${method.name}(${method.params.map(parameter => parameter.name).join(', ')})`;
    if (kind === 'value') {
      lines.push(
        `                let result = rn_gpui_module::__private::catch(|| ${call})??;`,
      );
      lines.push('                Ok(result.into_value())');
    } else if (kind === 'void') {
      lines.push('                Ok(Box::new(move || {');
      lines.push(
        `                    rn_gpui_module::__private::run_void(${JSON.stringify(`${name}.${method.jsName}`)}, move || ${call});`,
      );
      lines.push('                }))');
    } else {
      lines.push('                Ok(Box::pin(async move {');
      lines.push(
        `                    let result = rn_gpui_module::__private::catch_async(${call}).await??;`,
      );
      lines.push('                    Ok(result.into_value())');
      lines.push('                }))');
    }
    lines.push('            }');
  }
  lines.push(
    `            _ => Err(ModuleError::new(${JSON.stringify(`${name}: unknown method`)}))`,
  );
  lines.push('        }');
  lines.push('    }');
  return lines.join('\n');
}

/// `Value` has no `Clone` or `PartialEq`, so a struct that holds one, directly
/// or behind `Option`/`Vec`, derives less.
function isValueType(rustType) {
  const inner = rustType.endsWith('>')
    ? rustType.slice(rustType.indexOf('<') + 1, -1)
    : rustType;
  return inner === 'Value' || (inner !== rustType && isValueType(inner));
}

function renderStruct(struct) {
  const hasValueField = struct.fields.some(field =>
    isValueType(field.rustType),
  );
  const derives = hasValueField
    ? '#[derive(Debug)]'
    : '#[derive(Debug, Clone, PartialEq)]';
  const lines = [];
  lines.push(derives);
  lines.push(`pub struct ${struct.name} {`);
  for (const field of struct.fields) {
    lines.push(`    pub ${field.name}: ${field.rustType},`);
  }
  lines.push('}');
  lines.push('');
  lines.push(`impl FromValue for ${struct.name} {`);
  lines.push(
    '    fn from_value(value: Value, path: &mut Path) -> Result<Self, ModuleError> {',
  );
  lines.push('        let fields = match value {');
  lines.push('            Value::Object(fields) => fields,');
  lines.push(
    '            other => return Err(path.error(format!("expected object, got {}", other.type_name()))),',
  );
  lines.push('        };');
  lines.push('        let mut fields = FieldMap::new(fields);');
  lines.push(`        Ok(Self {`);
  for (const field of struct.fields) {
    const call = field.optional
      ? `fields.take_optional::<${innerType(field.rustType)}>(path, ${JSON.stringify(field.jsName)})?`
      : `fields.take::<${field.rustType}>(path, ${JSON.stringify(field.jsName)})?`;
    lines.push(`            ${field.name}: ${call},`);
  }
  lines.push('        })');
  lines.push('    }');
  lines.push('}');
  lines.push('');
  lines.push(`impl IntoValue for ${struct.name} {`);
  lines.push('    fn into_value(self) -> Value {');
  lines.push('        Value::Object(vec![');
  for (const field of struct.fields) {
    lines.push(
      `            (${JSON.stringify(field.jsName)}.to_string(), self.${field.name}.into_value()),`,
    );
  }
  lines.push('        ])');
  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}

const innerType = rustType =>
  rustType.startsWith('Option<') && rustType.endsWith('>')
    ? rustType.slice('Option<'.length, -1)
    : rustType;

function renderEnum(enumType) {
  const lines = [];
  lines.push('#[derive(Debug, Clone, Copy, PartialEq, Eq)]');
  lines.push(`pub enum ${enumType.name} {`);
  for (const member of enumType.members) {
    lines.push(`    ${member.variant},`);
  }
  lines.push('}');
  lines.push('');
  lines.push(`impl FromValue for ${enumType.name} {`);
  lines.push(
    '    fn from_value(value: Value, path: &mut Path) -> Result<Self, ModuleError> {',
  );
  lines.push('        match value {');
  const expected = enumType.members
    .map(member =>
      enumType.numeric ? String(member.value) : JSON.stringify(member.value),
    )
    .join(', ');
  if (enumType.numeric) {
    lines.push('            Value::Number(number) => match number as i64 {');
    for (const member of enumType.members) {
      lines.push(
        `                ${member.value} => Ok(Self::${member.variant}),`,
      );
    }
    lines.push(
      `                other => Err(path.error(format!(${rustString(`expected one of ${expected}, got {other}`)}))),`,
    );
    lines.push('            },');
  } else {
    lines.push('            Value::String(text) => match text.as_str() {');
    for (const member of enumType.members) {
      lines.push(
        `                ${JSON.stringify(member.value)} => Ok(Self::${member.variant}),`,
      );
    }
    lines.push(
      `                other => Err(path.error(format!(${rustString(`expected one of ${expected}, got "{other}"`)}))),`,
    );
    lines.push('            },');
  }
  lines.push(
    `            other => Err(path.error(format!(${rustString(
      enumType.numeric ? 'expected number, got {}' : 'expected string, got {}',
    )}, other.type_name()))),`,
  );
  lines.push('        }');
  lines.push('    }');
  lines.push('}');
  lines.push('');
  lines.push(`impl IntoValue for ${enumType.name} {`);
  lines.push('    fn into_value(self) -> Value {');
  lines.push('        match self {');
  for (const member of enumType.members) {
    const value = enumType.numeric
      ? `Value::Number(${member.value} as f64)`
      : `Value::String(${JSON.stringify(member.value)}.to_string())`;
    lines.push(`            Self::${member.variant} => ${value},`);
  }
  lines.push('        }');
  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}

/// Writes the generated file only when it changed.
export function writeRustSpec({ specPaths, outputPath }) {
  const contents = generateRustSpec({ specPaths });
  const existing = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, 'utf8')
    : null;
  if (existing !== contents) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, contents);
  }
  return contents;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('usage: generate-rust-spec <spec.ts>... <output.rs>');
    process.exit(2);
  }
  const outputPath = args.at(-1);
  writeRustSpec({ specPaths: args.slice(0, -1), outputPath });
}
