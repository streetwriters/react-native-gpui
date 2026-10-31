//! Windows: the probe puts a solid colour on the node's DirectComposition
//! visual, as a WebView2 composition controller or a video swap chain would.

use anyhow::Context as _;
use windows::{
    core::{IUnknown, Interface as _},
    Win32::{
        Foundation::HMODULE,
        Graphics::{
            Direct3D::{D3D_DRIVER_TYPE, D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP},
            Direct3D11::{
                D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11RenderTargetView,
                ID3D11Texture2D, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION,
            },
            DirectComposition::IDCompositionVisual,
            Dxgi::{
                Common::{
                    DXGI_ALPHA_MODE_PREMULTIPLIED, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC,
                },
                IDXGIAdapter, IDXGIDevice, IDXGIFactory2, IDXGISwapChain1, DXGI_PRESENT,
                DXGI_SCALING_STRETCH, DXGI_SWAP_CHAIN_DESC1, DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL,
                DXGI_USAGE_RENDER_TARGET_OUTPUT,
            },
        },
    },
};

use super::{counted::Count, ProbeBackend};

/// The swap chain's size in pixels. The node's clip crops it to its bounds, so
/// it only has to be larger than any test window.
const WIDTH: u32 = 3840;
const HEIGHT: u32 = 2160;

pub struct Composited {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    swap_chain: IDXGISwapChain1,
    _count: Count,
}

impl Composited {
    pub fn new(visual: Box<dyn std::any::Any>, argb: i32, count: Count) -> anyhow::Result<Self> {
        let unknown = visual
            .downcast::<IUnknown>()
            .map_err(|_| anyhow::anyhow!("the surface is not a DirectComposition visual"))?;
        let visual: IDCompositionVisual = unknown.cast().context("casting the surface's visual")?;
        let (device, context) = create_device()?;
        let dxgi_device: IDXGIDevice = device.cast()?;
        // SAFETY: plain DXGI calls on the device created above.
        let swap_chain = unsafe {
            let adapter: IDXGIAdapter = dxgi_device.GetAdapter()?;
            let factory: IDXGIFactory2 = adapter.GetParent()?;
            let description = DXGI_SWAP_CHAIN_DESC1 {
                Width: WIDTH,
                Height: HEIGHT,
                Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                Stereo: false.into(),
                SampleDesc: DXGI_SAMPLE_DESC {
                    Count: 1,
                    Quality: 0,
                },
                BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
                BufferCount: 2,
                Scaling: DXGI_SCALING_STRETCH,
                SwapEffect: DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL,
                AlphaMode: DXGI_ALPHA_MODE_PREMULTIPLIED,
                Flags: 0,
            };
            let swap_chain = factory.CreateSwapChainForComposition(&device, &description, None)?;
            visual.SetContent(&swap_chain)?;
            swap_chain
        };
        let probe = Self {
            device,
            context,
            swap_chain,
            _count: count,
        };
        probe.paint(argb)?;
        Ok(probe)
    }

    fn paint(&self, argb: i32) -> anyhow::Result<()> {
        let argb = argb as u32;
        let channel = |shift: u32| ((argb >> shift) & 0xff) as f32 / 255.0;
        let color = [channel(16), channel(8), channel(0), channel(24)];
        // SAFETY: the buffer, the view and the context belong to the device created with this probe.
        unsafe {
            let buffer: ID3D11Texture2D = self.swap_chain.GetBuffer(0)?;
            let mut view: Option<ID3D11RenderTargetView> = None;
            self.device
                .CreateRenderTargetView(&buffer, None, Some(&mut view))?;
            let view = view.context("no render target view")?;
            self.context.ClearRenderTargetView(&view, &color);
            self.swap_chain.Present(1, DXGI_PRESENT(0)).ok()?;
        }
        Ok(())
    }
}

impl ProbeBackend for Composited {
    fn fill(&self, argb: i32) {
        if let Err(error) = self.paint(argb) {
            log::error!("[native-probe] painting the composition surface: {error:#}");
        }
    }
}

fn create_device() -> anyhow::Result<(ID3D11Device, ID3D11DeviceContext)> {
    let mut last = None;
    for driver in [D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP] {
        match try_device(driver) {
            Ok(pair) => return Ok(pair),
            Err(error) => last = Some(error),
        }
    }
    Err(last.map_or_else(
        || anyhow::anyhow!("no Direct3D driver"),
        anyhow::Error::from,
    ))
}

fn try_device(
    driver: D3D_DRIVER_TYPE,
) -> windows::core::Result<(ID3D11Device, ID3D11DeviceContext)> {
    let mut device = None;
    let mut context = None;
    // SAFETY: the out pointers live for the call.
    unsafe {
        D3D11CreateDevice(
            None::<&IDXGIAdapter>,
            driver,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;
    }
    Ok((
        device.ok_or_else(windows::core::Error::empty)?,
        context.ok_or_else(windows::core::Error::empty)?,
    ))
}
