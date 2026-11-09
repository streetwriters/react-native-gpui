rn_gpui_module::include_specs!();

mod store;

use std::sync::{Arc, Mutex, OnceLock};

use gpui::{div, prelude::*, AnyElement, ObjectFit, RenderImage, StyledImage, Window};
use react_native_gpui::host_component::register_component;
use rn_gpui_module::ModuleError;
use smallvec::SmallVec;

use store::Store;

fn tiles() -> &'static Mutex<Store<RenderImage>> {
    static TILES: OnceLock<Mutex<Store<RenderImage>>> = OnceLock::new();
    TILES.get_or_init(|| Mutex::new(Store::default()))
}

fn bgra(pixels: &[u8], width: usize, height: usize, stride: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(width * height * 4);
    for row in 0..height {
        let line = &pixels[row * stride..row * stride + width * 4];
        for pixel in line.chunks_exact(4) {
            out.extend_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
        }
    }
    out
}

pub struct NativePdfTiles;

impl NativePdfTilesSpec for NativePdfTiles {
    fn new(_events: NativePdfTilesEvents) -> Self {
        Self
    }

    fn adopt(
        &self,
        pointer: f64,
        width: f64,
        height: f64,
        stride: f64,
    ) -> Result<f64, ModuleError> {
        let (width, height, stride) = (width as usize, height as usize, stride as usize);
        if pointer < 1.0 || width == 0 || height == 0 || stride < width * 4 {
            return Err(ModuleError::with_code("ERR_PDF_TILE", "invalid bitmap"));
        }
        let pixels =
            unsafe { std::slice::from_raw_parts(pointer as usize as *const u8, stride * height) };
        let buffer = image::RgbaImage::from_raw(
            width as u32,
            height as u32,
            bgra(pixels, width, height, stride),
        )
        .ok_or_else(|| ModuleError::with_code("ERR_PDF_TILE", "invalid bitmap"))?;
        let bytes = width * height * 4;
        let render = RenderImage::new(SmallVec::from_const([image::Frame::new(buffer)]));
        Ok(f64::from(tiles().lock().unwrap().insert(render, bytes)))
    }

    fn release(&self, id: f64) {
        tiles().lock().unwrap().remove(id as u32);
    }

    fn has(&self, id: f64) -> Result<bool, ModuleError> {
        Ok(tiles().lock().unwrap().contains(id as u32))
    }

    fn set_budget(&self, bytes: f64) {
        tiles().lock().unwrap().set_budget(bytes.max(0.0) as usize);
    }

    fn stats(&self) -> Result<PdfTileStats, ModuleError> {
        let (count, bytes, budget, evicted) = tiles().lock().unwrap().stats();
        Ok(PdfTileStats {
            tiles: count as f64,
            bytes: bytes as f64,
            budget: budget as f64,
            evicted: evicted as f64,
        })
    }
}

struct Tile {
    image: Option<Arc<RenderImage>>,
    id: i32,
}

impl PdfTileSpec for Tile {
    fn create(props: &PdfTileProps, _cx: &mut PdfTileContext) -> Self {
        Self {
            image: None,
            id: props.tile_id(),
        }
    }

    fn update(&mut self, props: &PdfTileProps, changed: PdfTileChanged, _cx: &mut PdfTileContext) {
        if changed.tile_id() {
            self.id = props.tile_id();
            self.image = None;
        }
    }

    fn render(
        &mut self,
        _props: &PdfTileProps,
        window: &mut Window,
        _cx: &mut PdfTileContext,
    ) -> AnyElement {
        let (image, dropped) = {
            let mut store = tiles().lock().unwrap();
            let image = if self.id > 0 {
                store.get(self.id as u32)
            } else {
                None
            };
            (image, store.take_dropped())
        };
        for texture in dropped {
            let _ = window.drop_image(texture);
        }
        self.image = image.clone();
        match image {
            Some(image) => gpui::img(image)
                .object_fit(ObjectFit::Fill)
                .size_full()
                .into_any_element(),
            None => div().size_full().into_any_element(),
        }
    }
}

pub fn rn_gpui_register() {
    rn_gpui_module::register(native_pdf_tiles_module::<NativePdfTiles>());
    register_component(pdf_tile_component::<Tile>());
}
