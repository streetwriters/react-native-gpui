import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Appearance,
  DynamicColorIOS,
  PlatformColor,
  RefreshControl,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';

const RED_2X3 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAEUlEQVR4nGP4z8DwH4QZMBgAoXkL9U3EmgcAAAAASUVORK5CYII=';
const IMAGE_BASE = 'http://127.0.0.1:18765';
const PROGRESS_URL = 'http://127.0.0.1:18765/noise.png';

export default function CoreComponentsFixture() {
  const commandScroll = useRef<ScrollViewInstance>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rotatedPresses, setRotatedPresses] = useState(0);
  const [slopPresses, setSlopPresses] = useState(0);
  const [retainedPresses, setRetainedPresses] = useState(0);
  const [defaultPresses, setDefaultPresses] = useState(0);
  const [rotatedLocation, setRotatedLocation] = useState('none');
  const keepScroll = useRef<ScrollViewInstance>(null);
  const [keepOffset, setKeepOffset] = useState('0');
  const [keepItems, setKeepItems] = useState([3, 2, 1, 0]);
  const [commandOffset, setCommandOffset] = useState('0');
  const [controlled, setControlled] = useState(false);
  const [changes, setChanges] = useState(0);
  const [animating, setAnimating] = useState(true);
  const [selection, setSelection] = useState('none');
  const [keys, setKeys] = useState('');
  const [events, setEvents] = useState('');
  const [readOnlySelection, setReadOnlySelection] = useState('none');
  const [menuSelection, setMenuSelection] = useState('none');
  const [multiSizes, setMultiSizes] = useState('');
  const [multiScroll, setMultiScroll] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRequests, setModalRequests] = useState(0);
  const [hoverLog, setHoverLog] = useState('');
  const [keyPresses, setKeyPresses] = useState(0);
  const [textLayout, setTextLayout] = useState('none');
  const [imageSize, setImageSize] = useState('none');
  const [imagePrefetch, setImagePrefetch] = useState('none');
  const [showImages, setShowImages] = useState(false);
  const [showStyled, setShowStyled] = useState(false);
  const [intervalOffset, setIntervalOffset] = useState('');
  const [scrollLog, setScrollLog] = useState('');
  const [normalFlick, setNormalFlick] = useState('0|');
  const [fastFlick, setFastFlick] = useState('0|');
  const [scrollOffsets, setScrollOffsets] = useState('');
  const [imageLog, setImageLog] = useState('');
  const [imageProgress, setImageProgress] = useState('');
  const [limited, setLimited] = useState('');
  return (
    <ScrollView
      testID="core-components-fixture"
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Core components</Text>
      <View style={styles.section}>
        <Text style={styles.heading}>Hit slop</Text>
        <View testID="slop-area" style={styles.slopArea}>
          <Pressable
            testID="slop-press"
            hitSlop={20}
            pressRetentionOffset={{ top: 80, left: 80, right: 80, bottom: 80 }}
            style={styles.slopBox}
            onPress={() => setSlopPresses(count => count + 1)}
          />
          <Pressable
            testID="slop-default"
            style={styles.slopDefault}
            onPress={() => setDefaultPresses(count => count + 1)}
          />
          <Pressable
            testID="slop-retained"
            pressRetentionOffset={{ top: 80, left: 80, right: 80, bottom: 80 }}
            style={styles.slopRetained}
            onPress={() => setRetainedPresses(count => count + 1)}
          />
        </View>
        <Text testID="slop-count">{String(slopPresses)}</Text>
        <Text testID="slop-default-count">{String(defaultPresses)}</Text>
        <Text testID="slop-retained-count">{String(retainedPresses)}</Text>
      </View>
      <Modal
        visible={modalOpen}
        transparent
        onRequestClose={() => setModalRequests(count => count + 1)}
      >
        <View style={styles.modalBackdrop}>
          <Text testID="modal-body" style={styles.modalBody}>
            modal
          </Text>
          <Text
            testID="modal-close"
            style={styles.modalBody}
            onPress={() => setModalOpen(false)}
          >
            close
          </Text>
        </View>
      </Modal>
      <View style={styles.fontRow}>
        <Pressable
          testID="hover-target"
          onHoverIn={() => setHoverLog(previous => previous + 'in,')}
          onHoverOut={() => setHoverLog(previous => previous + 'out,')}
        >
          <Text>hover</Text>
        </Pressable>
        <Pressable
          testID="hover-delayed"
          delayHoverIn={300}
          onHoverIn={() => setHoverLog(previous => previous + 'delayed-in,')}
        >
          <Text>delayed</Text>
        </Pressable>
        <Pressable
          testID="press-key"
          onPress={() => setKeyPresses(count => count + 1)}
        >
          <Text>key</Text>
        </Pressable>
        <Text testID="hover-log">{hoverLog}</Text>
        <Text testID="key-presses">{String(keyPresses)}</Text>
      </View>
      <View style={styles.fontRow}>
        <Text testID="modal-open" onPress={() => setModalOpen(true)}>
          open modal
        </Text>
        <Text testID="modal-requests">{String(modalRequests)}</Text>
      </View>
      <View style={styles.fontRow}>
        <Text testID="font-default" style={styles.fontSample}>
          Scale
        </Text>
        <Text
          testID="font-fixed"
          allowFontScaling={false}
          style={styles.fontSample}
        >
          Scale
        </Text>
        <Text
          testID="font-capped"
          maxFontSizeMultiplier={1.5}
          style={styles.fontSample}
        >
          Scale
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>ScrollView</Text>
        <ScrollView
          testID="scroll-paged"
          style={styles.pager}
          pagingEnabled
          onScrollBeginDrag={() =>
            setScrollLog(previous => previous + 'begin,')
          }
          onScrollEndDrag={() => setScrollLog(previous => previous + 'end,')}
          onMomentumScrollBegin={() =>
            setScrollLog(previous => previous + 'mbegin,')
          }
          onMomentumScrollEnd={() =>
            setScrollLog(previous => previous + 'mend,')
          }
          onScroll={event => {
            const y = Math.round(event.nativeEvent.contentOffset.y);
            setScrollOffsets(y.toString());
          }}
          scrollEventThrottle={16}
        >
          {[0, 1, 2, 3, 4, 5].map(index => (
            <View key={index} style={styles.page}>
              <Text>{`page ${index}`}</Text>
            </View>
          ))}
        </ScrollView>
        <Text testID="scroll-log">{scrollLog}</Text>
        <Text testID="scroll-offset">{scrollOffsets}</Text>
        <ScrollView
          testID="scroll-interval"
          style={styles.pager}
          snapToInterval={80}
          decelerationRate="fast"
          onScroll={event => {
            const y = Math.round(event.nativeEvent.contentOffset.y);
            setIntervalOffset(y.toString());
          }}
          scrollEventThrottle={16}
        >
          {[0, 1, 2, 3, 4].map(index => (
            <View key={index} style={styles.interval}>
              <Text>{`row ${index}`}</Text>
            </View>
          ))}
        </ScrollView>
        <Text testID="scroll-interval-offset">{intervalOffset}</Text>
        <ScrollView
          testID="flick-normal"
          style={styles.pager}
          onScroll={event =>
            setNormalFlick(
              previous =>
                `${Math.round(event.nativeEvent.contentOffset.y)}|${previous.split('|')[1]}`,
            )
          }
          onMomentumScrollBegin={() =>
            setNormalFlick(previous => `${previous.split('|')[0]}|begin`)
          }
          onMomentumScrollEnd={() =>
            setNormalFlick(previous => `${previous.split('|')[0]}|end`)
          }
          scrollEventThrottle={16}
        >
          <View style={styles.flickContent} />
        </ScrollView>
        <Text testID="flick-normal-state">{normalFlick}</Text>
        <ScrollView
          testID="flick-fast"
          style={styles.pager}
          decelerationRate="fast"
          onScroll={event =>
            setFastFlick(
              previous =>
                `${Math.round(event.nativeEvent.contentOffset.y)}|${previous.split('|')[1]}`,
            )
          }
          onMomentumScrollBegin={() =>
            setFastFlick(previous => `${previous.split('|')[0]}|begin`)
          }
          onMomentumScrollEnd={() =>
            setFastFlick(previous => `${previous.split('|')[0]}|end`)
          }
          scrollEventThrottle={16}
        >
          <View style={styles.flickContent} />
        </ScrollView>
        <Text testID="flick-fast-state">{fastFlick}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Switch</Text>
        <Switch
          testID="switch-controlled"
          value={controlled}
          onValueChange={value => {
            setChanges(count => count + 1);
            setControlled(value);
          }}
        />
        <Text testID="switch-value">{String(controlled)}</Text>
        <Text testID="switch-changes">{String(changes)}</Text>
        <Switch
          testID="switch-refusing"
          value={false}
          onValueChange={() => setChanges(count => count + 100)}
        />
        <Switch testID="switch-disabled" value disabled />
        <Switch
          testID="switch-colored"
          value
          trackColor={{ true: '#e91e63', false: '#000000' }}
          thumbColor="#ffeb3b"
        />
        <Switch
          testID="switch-colored-off"
          value={false}
          trackColor={{ false: '#ff9800', true: '#000000' }}
        />
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>ActivityIndicator</Text>
        <ActivityIndicator testID="indicator-small" animating={animating} />
        <ActivityIndicator
          testID="indicator-large"
          size="large"
          color="#e91e63"
          animating={animating}
        />
        <ActivityIndicator
          testID="indicator-visible"
          animating={false}
          hidesWhenStopped={false}
        />
        <Text testID="indicator-toggle" onPress={() => setAnimating(a => !a)}>
          {animating ? 'stop' : 'start'}
        </Text>
        <TextInput
          testID="input-multi"
          multiline
          numberOfLines={3}
          defaultValue={'1\n2\n3\n4\n5\n6\n7\n8\n9\n10'}
          onContentSizeChange={event => {
            const { width, height } = event.nativeEvent.contentSize;
            setMultiSizes(
              previous =>
                previous + `${Math.round(width)}x${Math.round(height)},`,
            );
          }}
          onScroll={event =>
            setMultiScroll(Math.round(event.nativeEvent.contentOffset.y))
          }
          style={styles.multi}
        />
        <Text testID="input-multi-sizes">{multiSizes}</Text>
        <Text testID="input-multi-scroll">{String(multiScroll)}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>TextInput</Text>
        <TextInput
          testID="input-placeholder"
          placeholder="WWWWWWWWWW"
          placeholderTextColor="#ff0000"
          style={styles.input}
        />
        <TextInput
          testID="input-caret-hidden"
          defaultValue="no caret"
          caretHidden
          style={styles.input}
        />
        <TextInput
          testID="input-select-on-focus"
          defaultValue="select me"
          selectTextOnFocus
          onSelectionChange={event =>
            setSelection(
              `${event.nativeEvent.selection.start}-${event.nativeEvent.selection.end}`,
            )
          }
          style={styles.input}
        />
        <Text testID="input-selection">{selection}</Text>
        <TextInput
          testID="input-keys"
          onKeyPress={event => {
            const key = event.nativeEvent.key;
            setKeys(previous => previous + `[${key}]`);
          }}
          onSubmitEditing={() => setEvents(previous => previous + 'submit,')}
          onEndEditing={() => setEvents(previous => previous + 'end,')}
          style={styles.input}
        />
        <Text testID="input-key-log">{keys}</Text>
        <Text testID="input-event-log">{events}</Text>
        <TextInput
          testID="input-submit-keeps-focus"
          submitBehavior="submit"
          onSubmitEditing={() => setEvents(previous => previous + 'keep,')}
          onEndEditing={() => setEvents(previous => previous + 'keep-end,')}
          style={styles.input}
        />
        <TextInput
          testID="input-dismiss"
          submitBehavior="submit"
          onSubmitEditing={() => Keyboard.dismiss()}
          onEndEditing={() => setEvents(previous => previous + 'dismiss-end,')}
          style={styles.input}
        />
        <TextInput
          testID="input-max-length"
          maxLength={5}
          onChangeText={setLimited}
          style={styles.input}
        />
        <Text testID="input-max-length-value">{`[${limited}]`}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>TextInput 2</Text>
        <TextInput
          testID="input-read-only"
          readOnly
          defaultValue="read only"
          onChangeText={() => setEvents(previous => previous + 'ro-change,')}
          onSelectionChange={event =>
            setReadOnlySelection(
              `${event.nativeEvent.selection.start}-${event.nativeEvent.selection.end}`,
            )
          }
          style={styles.input}
        />
        <Text testID="input-read-only-selection">{readOnlySelection}</Text>
        <TextInput
          testID="input-menu"
          defaultValue="hello world"
          onSelectionChange={event =>
            setMenuSelection(
              `${event.nativeEvent.selection.start}-${event.nativeEvent.selection.end}`,
            )
          }
          style={styles.input}
        />
        <Text testID="input-menu-selection">{menuSelection}</Text>
        <TextInput
          testID="input-menu-hidden"
          defaultValue="no menu"
          contextMenuHidden
          style={styles.input}
        />
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Text</Text>
        <Text testID="shadow-plain" style={styles.shadowSample}>
          Shadow
        </Text>
        <Text
          testID="shadow-hard"
          style={[
            styles.shadowSample,
            {
              textShadowColor: '#ff0000',
              textShadowOffset: { width: 6, height: 6 },
              textShadowRadius: 0,
            },
          ]}
        >
          Shadow
        </Text>
        <Text
          testID="shadow-soft"
          style={[
            styles.shadowSample,
            {
              textShadowColor: 'rgba(0, 0, 0, 0.75)',
              textShadowOffset: { width: 2, height: 2 },
              textShadowRadius: 4,
            },
          ]}
        >
          Shadow
        </Text>
        <View
          testID="box-shadow-wrap"
          style={{
            padding: 16,
            backgroundColor: '#fff',
            alignSelf: 'flex-start',
          }}
        >
          <View
            testID="box-shadow"
            style={{
              width: 60,
              height: 30,
              backgroundColor: '#fff',
              boxShadow: '4px 4px 6px rgba(0, 0, 0, 0.6)',
            }}
          />
        </View>
        <View
          testID="gradient-linear"
          style={{
            width: 100,
            height: 30,
            borderRadius: 8,
            experimental_backgroundImage:
              'linear-gradient(to right, #ff0000, #0000ff)',
          }}
        />
        <View
          testID="gradient-multi"
          style={{
            width: 100,
            height: 30,
            experimental_backgroundImage:
              'linear-gradient(90deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)',
          }}
        />
        <View
          testID="gradient-radial"
          style={{
            width: 60,
            height: 60,
            experimental_backgroundImage:
              'radial-gradient(circle closest-side at center, #ff0000, #0000ff)',
          }}
        />
        <Text testID="fit-off" numberOfLines={1} style={styles.fitSample}>
          Long text that cannot fit
        </Text>
        <Text
          testID="fit-on"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.3}
          style={styles.fitSample}
        >
          Long text that cannot fit
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Text 2</Text>
        <Text testID="transform-plain" style={styles.selectSample}>
          abab
        </Text>
        <Text
          testID="transform-upper"
          style={[styles.selectSample, { textTransform: 'uppercase' }]}
        >
          abab
        </Text>
        <Text testID="digits-plain" style={styles.selectSample}>
          1111
        </Text>
        <Text
          testID="digits-tabular"
          style={[styles.selectSample, { fontVariant: ['tabular-nums'] }]}
        >
          1111
        </Text>
        <Text testID="select-text" selectable style={styles.selectSample}>
          alpha beta gamma
        </Text>
        <Text
          testID="select-user"
          style={[styles.selectSample, { userSelect: 'text' }]}
        >
          alpha beta gamma
        </Text>
        <Text
          testID="text-layout"
          style={styles.layoutSample}
          onTextLayout={event => {
            const { lines } = event.nativeEvent;
            setTextLayout(
              `${lines.length}:${lines.map(line => line.text.trim()).join('|')}`,
            );
          }}
        >
          one two three four five six seven eight
        </Text>
        <Text testID="text-layout-log">{textLayout}</Text>
        <Text testID="select-text-off" style={styles.selectSample}>
          alpha beta gamma
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Image</Text>
        <Text testID="image-show" onPress={() => setShowImages(true)}>
          show images
        </Text>
        {showImages ? (
          <>
            <Image
              testID="image-data"
              source={{ uri: RED_2X3 }}
              style={styles.imageSample}
              onLoadStart={() => setImageLog(previous => previous + 'start,')}
              onLoad={event => {
                const { width, height } = event.nativeEvent.source;
                setImageLog(previous => previous + `load:${width}x${height},`);
              }}
              onLoadEnd={() => setImageLog(previous => previous + 'end,')}
            />
            <Image
              testID="image-missing"
              source={{ uri: 'file:///no/such/image.png' }}
              style={styles.imageSample}
              onError={() => setImageLog(previous => previous + 'error,')}
            />
            <Text testID="image-log">{imageLog}</Text>
            <Image
              testID="image-progress"
              source={{ uri: PROGRESS_URL }}
              style={styles.imageSample}
              onProgress={event => {
                const { loaded, total } = event.nativeEvent;
                setImageProgress(`${loaded}/${total}`);
              }}
            />
            <Text testID="image-progress-log">{imageProgress}</Text>
            <Text
              testID="image-size-run"
              onPress={() => {
                Image.getSize(RED_2X3).then(
                  ({ width, height }) => setImageSize(`${width}x${height}`),
                  () => setImageSize('size-error'),
                );
                Image.prefetch(RED_2X3).then(
                  ok => setImagePrefetch(String(ok)),
                  () => setImagePrefetch('prefetch-error'),
                );
              }}
            >
              measure
            </Text>
            <Text testID="image-size">{imageSize}</Text>
            <Text testID="image-prefetch">{imagePrefetch}</Text>
          </>
        ) : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Image styles</Text>
        <Text testID="image-styled-show" onPress={() => setShowStyled(true)}>
          show styled
        </Text>
        {showStyled ? (
          <>
            <Image
              testID="image-tint"
              source={{ uri: `${IMAGE_BASE}/white.png` }}
              tintColor="#00ff00"
              resizeMode="stretch"
              style={styles.imageSample}
            />
            <Image
              testID="image-sharp"
              source={{ uri: `${IMAGE_BASE}/checker.png` }}
              resizeMode="stretch"
              style={styles.imageSample}
            />
            <Image
              testID="image-blur"
              source={{ uri: `${IMAGE_BASE}/checker.png` }}
              blurRadius={8}
              resizeMode="stretch"
              style={styles.imageSample}
            />
            <Image
              testID="image-repeat"
              source={{ uri: `${IMAGE_BASE}/split.png` }}
              resizeMode="repeat"
              style={styles.imageSample}
            />
            <Image
              testID="image-default"
              source={{ uri: `${IMAGE_BASE}/slow.png` }}
              defaultSource={{ uri: `${IMAGE_BASE}/green.png` }}
              resizeMode="stretch"
              style={styles.imageSample}
            />
          </>
        ) : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>ScrollView commands</Text>
        <ScrollView
          ref={commandScroll}
          testID="scroll-command"
          style={styles.pager}
          onScroll={event =>
            setCommandOffset(
              Math.round(event.nativeEvent.contentOffset.y).toString(),
            )
          }
          scrollEventThrottle={16}
        >
          {[0, 1, 2, 3, 4].map(index => (
            <View key={index} style={styles.interval}>
              <Text>{`item ${index}`}</Text>
            </View>
          ))}
        </ScrollView>
        <Text testID="scroll-command-offset">{commandOffset}</Text>
        <Text
          testID="scroll-command-to"
          onPress={() =>
            commandScroll.current?.scrollTo({ y: 150, animated: false })
          }
        >
          to 150
        </Text>
        <Text
          testID="scroll-command-end"
          onPress={() => commandScroll.current?.scrollToEnd({ animated: true })}
        >
          to end
        </Text>
        <ScrollView
          ref={keepScroll}
          testID="scroll-keep"
          style={styles.pager}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={event =>
            setKeepOffset(
              Math.round(event.nativeEvent.contentOffset.y).toString(),
            )
          }
          scrollEventThrottle={16}
        >
          {keepItems.map(id => (
            <View key={id} style={styles.interval}>
              <Text>{`keep ${id}`}</Text>
            </View>
          ))}
        </ScrollView>
        <Text testID="scroll-keep-offset">{keepOffset}</Text>
        <Text
          testID="scroll-keep-to"
          onPress={() =>
            keepScroll.current?.scrollTo({ y: 100, animated: false })
          }
        >
          keep to 100
        </Text>
        <Text
          testID="scroll-keep-prepend"
          onPress={() => setKeepItems(items => [items.length, ...items])}
        >
          prepend
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Platform colors</Text>
        <Text testID="color-scheme">{String(Appearance.getColorScheme())}</Text>
        <View
          testID="color-platform"
          style={[
            styles.swatch,
            { backgroundColor: PlatformColor('systemRedColor') },
          ]}
        />
        <View
          testID="color-fallback"
          style={[
            styles.swatch,
            { backgroundColor: PlatformColor('noSuchColorZzz', 'systemBlue') },
          ]}
        />
        <View
          testID="color-dynamic"
          style={[
            styles.swatch,
            {
              backgroundColor: DynamicColorIOS({
                light: '#00ff00',
                dark: '#ff00ff',
              }),
            },
          ]}
        />
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>RefreshControl</Text>
        <ScrollView
          testID="refresh-scroll"
          style={styles.pager}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {}} />
          }
        >
          <Text>refresh content</Text>
        </ScrollView>
        <Text testID="refresh-toggle" onPress={() => setRefreshing(on => !on)}>
          toggle refreshing
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Transforms</Text>
        <View testID="rot-area" style={styles.rotArea}>
          <Pressable
            testID="rot-press"
            onPress={() => setRotatedPresses(count => count + 1)}
            onPressIn={event =>
              setRotatedLocation(
                `${Math.round(event.nativeEvent.locationX)},${Math.round(event.nativeEvent.locationY)}`,
              )
            }
            style={styles.rotBox}
          />
        </View>
        <Text testID="rot-count">{String(rotatedPresses)}</Text>
        <Text testID="rot-location">{rotatedLocation}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Filters</Text>
        <View testID="filter-gray" style={styles.rotArea}>
          <View style={[styles.shape, styles.filterBox, styles.filterGray]} />
        </View>
        <View testID="filter-invert" style={styles.rotArea}>
          <View style={[styles.shape, styles.filterBox, styles.filterInvert]} />
        </View>
        <View testID="filter-half" style={styles.rotArea}>
          <View style={[styles.shape, styles.filterBox, styles.filterHalf]} />
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Blur and drop shadow</Text>
        <View testID="filter-blur" style={styles.rotArea}>
          <View style={styles.blurBox} />
        </View>
        <View testID="filter-shadow" style={styles.rotArea}>
          <View style={styles.shadowBox} />
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Blend modes</Text>
        <View testID="blend-multiply" style={styles.blendBackdrop}>
          <View style={[styles.blendBox, { mixBlendMode: 'multiply' }]} />
        </View>
        <View testID="blend-difference" style={styles.blendBackdrop}>
          <View style={[styles.blendBox, { mixBlendMode: 'difference' }]} />
        </View>
        <View testID="blend-isolated" style={styles.blendBackdrop}>
          <View style={styles.blendIsolated}>
            <View style={[styles.blendBox, { mixBlendMode: 'multiply' }]} />
          </View>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Effects in a scroll view</Text>
        <ScrollView testID="effects-scroll" style={styles.effectsScroll}>
          <View style={styles.effectsContent}>
            <View style={styles.effectsFaded}>
              <View style={styles.groupRed} />
              <View style={styles.groupBlue} />
            </View>
            <View style={styles.effectsBlur} />
          </View>
        </ScrollView>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Group opacity</Text>
        <View testID="group-opacity" style={styles.rotArea}>
          <View style={styles.groupFaded}>
            <View style={styles.groupRed} />
            <View style={styles.groupBlue} />
          </View>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>More transforms</Text>
        <View testID="backface-hidden" style={styles.rotArea}>
          <View
            style={[styles.shape, styles.filterBox, styles.backfaceHidden]}
          />
        </View>
        <View testID="backface-visible" style={styles.rotArea}>
          <View
            style={[styles.shape, styles.filterBox, styles.backfaceShown]}
          />
        </View>
        <View testID="rot-diamond-area" style={styles.rotArea}>
          <View style={[styles.shape, styles.diamond]} />
        </View>
        <View testID="flip-area" style={styles.rotArea}>
          <View style={[styles.shape, styles.flip]}>
            <View style={styles.flipLeft} />
            <View style={styles.flipRight} />
          </View>
        </View>
        <View testID="skew-area" style={styles.rotArea}>
          <View style={[styles.shape, styles.skew]} />
        </View>
        <View testID="clip-area" style={styles.rotArea}>
          <View style={[styles.shape, styles.clip]}>
            <View style={styles.clipChild} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
    gap: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  title: { fontSize: 20, color: '#111', width: '100%' },
  section: { gap: 10, width: 232 },
  heading: { fontSize: 16, color: '#333' },
  multi: {
    width: 200,
    padding: 0,
    fontSize: 14,
    lineHeight: 20,
    color: '#111',
    backgroundColor: '#eef',
  },
  fontRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000066',
  },
  modalBody: { fontSize: 20, color: '#fff', padding: 8 },
  shadowSample: {
    fontSize: 28,
    color: '#000',
    paddingRight: 12,
    paddingBottom: 12,
    alignSelf: 'flex-start',
  },
  selectSample: { fontSize: 20, color: '#000', alignSelf: 'flex-start' },
  layoutSample: { fontSize: 20, color: '#000', width: 140 },
  rotArea: { width: 100, height: 100, backgroundColor: '#fff' },
  rotBox: {
    position: 'absolute',
    left: 20,
    top: 35,
    width: 60,
    height: 30,
    backgroundColor: '#ff0000',
    transform: [{ rotate: '90deg' }],
  },
  shape: { position: 'absolute' },
  backfaceHidden: {
    backfaceVisibility: 'hidden',
    transform: [{ rotateY: '180deg' }],
  },
  backfaceShown: {
    backfaceVisibility: 'visible',
    transform: [{ rotateY: '180deg' }],
  },
  filterBox: {
    left: 20,
    top: 20,
    width: 60,
    height: 60,
    backgroundColor: '#ff0000',
  },
  blurBox: {
    position: 'absolute',
    left: 30,
    top: 30,
    width: 40,
    height: 40,
    backgroundColor: '#000000',
    filter: [{ blur: 4 }],
  },
  shadowBox: {
    position: 'absolute',
    left: 20,
    top: 20,
    width: 40,
    height: 40,
    backgroundColor: '#ff0000',
    filter: [
      {
        dropShadow: {
          offsetX: 12,
          offsetY: 12,
          standardDeviation: 1,
          color: '#0000ff',
        },
      },
    ],
  },
  blendBackdrop: { width: 100, height: 100, backgroundColor: '#808080' },
  blendBox: {
    position: 'absolute',
    left: 25,
    top: 25,
    width: 50,
    height: 50,
    backgroundColor: '#ff8000',
  },
  blendIsolated: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    isolation: 'isolate',
  },
  effectsScroll: {
    width: 100,
    height: 100,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#fff',
  },
  effectsContent: { width: 100, height: 400 },
  effectsFaded: {
    position: 'absolute',
    left: 10,
    top: 120,
    width: 80,
    height: 80,
    opacity: 0.5,
  },
  effectsBlur: {
    position: 'absolute',
    left: 30,
    top: 240,
    width: 40,
    height: 40,
    backgroundColor: '#000000',
    filter: [{ blur: 4 }],
  },
  slopArea: { width: 170, height: 260, backgroundColor: '#eee' },
  slopBox: {
    position: 'absolute',
    left: 60,
    top: 20,
    width: 40,
    height: 40,
    backgroundColor: '#08f',
  },
  slopDefault: {
    position: 'absolute',
    left: 60,
    top: 110,
    width: 40,
    height: 40,
    backgroundColor: '#f80',
  },
  slopRetained: {
    position: 'absolute',
    left: 60,
    top: 200,
    width: 40,
    height: 40,
    backgroundColor: '#8f0',
  },
  groupFaded: {
    position: 'absolute',
    left: 10,
    top: 10,
    width: 80,
    height: 80,
    opacity: 0.5,
  },
  groupRed: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 50,
    height: 50,
    backgroundColor: '#ff0000',
  },
  groupBlue: {
    position: 'absolute',
    left: 30,
    top: 30,
    width: 50,
    height: 50,
    backgroundColor: '#0000ff',
  },
  filterGray: { filter: [{ grayscale: 1 }] },
  filterInvert: { filter: [{ invert: 1 }] },
  filterHalf: { filter: [{ opacity: 0.5 }] },
  diamond: {
    left: 30,
    top: 30,
    width: 40,
    height: 40,
    backgroundColor: '#ff0000',
    transform: [{ rotate: '45deg' }],
  },
  flip: {
    left: 30,
    top: 40,
    width: 40,
    height: 20,
    flexDirection: 'row',
    transform: [{ scaleX: -1 }],
  },
  flipLeft: { flex: 1, backgroundColor: '#0000ff' },
  flipRight: { flex: 1, backgroundColor: '#ff0000' },
  skew: {
    left: 30,
    top: 40,
    width: 40,
    height: 20,
    backgroundColor: '#ff0000',
    transform: [{ skewX: '45deg' }],
  },
  clip: {
    left: 20,
    top: 35,
    width: 60,
    height: 30,
    overflow: 'hidden',
    transform: [{ rotate: '90deg' }],
  },
  clipChild: { width: 60, height: 60, backgroundColor: '#ff0000' },
  swatch: { width: 40, height: 40 },
  imageSample: { width: 40, height: 40, backgroundColor: '#ddd' },
  pager: {
    height: 100,
    width: 200,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#eef',
  },
  flickContent: { height: 6000 },
  page: { height: 100, alignItems: 'center', justifyContent: 'center' },
  interval: { height: 80, alignItems: 'center', justifyContent: 'center' },
  fitSample: { fontSize: 30, color: '#000', width: 120, lineHeight: 36 },
  fontSample: { fontSize: 16, color: '#111' },
  input: {
    height: 32,
    borderWidth: 1,
    borderColor: '#999',
    paddingHorizontal: 6,
    fontSize: 16,
  },
});
