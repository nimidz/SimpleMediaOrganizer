use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use serde::{Deserialize, Serialize};
use sysinfo::Disks;
use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State,
};

static CANCEL_SCAN: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DriveInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub free: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub extension: String,
    pub category: String,
    pub size: u64,
    pub mtime_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderReadResult {
    pub success: bool,
    pub error: Option<String>,
    pub items: Vec<FileItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileOpResult {
    pub success: bool,
    pub error: Option<String>,
    pub recycled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OrganizerTask {
    #[serde(default)]
    pub id: Option<String>,
    pub source_folder: String,
    pub schedule_type: Option<String>,
    pub move_newer_only: Option<bool>,
    pub enabled: Option<bool>,
    pub last_run: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizerResult {
    pub success: bool,
    pub error: Option<String>,
    pub moved_count: u32,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CategorySummary {
    pub count: u32,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    pub folder_path: String,
    pub folder_name: String,
    pub counts: HashMap<String, u32>,
    pub total_files: u32,
    pub total_size: u64,
    pub latest_item: Option<FileItem>,
    pub latest_image: Option<FileItem>,
    pub latest_video: Option<FileItem>,
    pub latest_audio: Option<FileItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressPayload {
    pub current_dir: String,
    pub queue_length: usize,
    pub processed_dirs: u32,
    pub summary: serde_json::Value,
    pub folders: Vec<FolderInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanCompletePayload {
    pub success: bool,
    pub summary: serde_json::Value,
    pub folders: Vec<FolderInfo>,
    pub error: Option<String>,
}

fn format_scan_summary(
    total_files: u32,
    total_folders: u32,
    duration_ms: u64,
    category_map: &HashMap<String, CategorySummary>,
) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    map.insert("totalFiles".to_string(), serde_json::json!(total_files));
    map.insert("totalFolders".to_string(), serde_json::json!(total_folders));
    map.insert("durationMs".to_string(), serde_json::json!(duration_ms));

    for (cat, stat) in category_map {
        map.insert(cat.clone(), serde_json::json!({
            "count": stat.count,
            "size": stat.size,
        }));
    }

    serde_json::Value::Object(map)
}

// Global state holding tray icon handle for dynamic updates
struct TrayState {
    tray: Mutex<Option<TrayIcon>>,
}

fn get_storage_path(app: &tauri::AppHandle, filename: &str) -> PathBuf {
    let base_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = fs::create_dir_all(&base_dir);
    base_dir.join(filename)
}

fn default_extension_map() -> HashMap<String, HashSet<String>> {
    let mut map = HashMap::new();
    map.insert(
        "image".to_string(),
        [
            ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg", ".ico", ".tiff", ".tif", ".heic", ".heif",
            ".raw", ".cr2", ".nef", ".avif",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect(),
    );
    map.insert(
        "video".to_string(),
        [
            ".mp4", ".mkv", ".webm", ".avi", ".mov", ".wmv", ".flv", ".m4v", ".3gp", ".ts", ".m2ts", ".vob",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect(),
    );
    map.insert(
        "audio".to_string(),
        [
            ".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg", ".wma", ".opus", ".alac", ".aiff", ".mid", ".midi",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect(),
    );
    map.insert(
        "document".to_string(),
        [
            ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".txt", ".csv", ".md", ".rtf", ".epub",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect(),
    );
    map.insert(
        "archive".to_string(),
        [".zip", ".rar", ".7z", ".tar", ".gz", ".iso", ".bz2", ".xz"]
            .iter()
            .map(|s| s.to_string())
            .collect(),
    );
    map.insert(
        "app".to_string(),
        [".exe", ".msi", ".apk"]
            .iter()
            .map(|s| s.to_string())
            .collect(),
    );
    map.insert(
        "other".to_string(),
        [".Unassigned (Extension)"]
            .iter()
            .map(|s| s.to_string())
            .collect(),
    );
    map
}

fn build_ext_map(custom: Option<&serde_json::Value>) -> HashMap<String, HashSet<String>> {
    let mut map: HashMap<String, HashSet<String>> = HashMap::new();
    let mut claimed_extensions: HashSet<String> = HashSet::new();

    // 1. Process custom or user-modified categories FIRST so they take priority
    if let Some(serde_json::Value::Object(obj)) = custom {
        for (cat_key, cat_val) in obj {
            if let Some(exts) = cat_val.get("extensions").and_then(|e| e.as_array()) {
                let mut set = HashSet::new();
                for e in exts {
                    if let Some(s) = e.as_str() {
                        let lower = s.to_lowercase();
                        let ext = if lower.starts_with('.') {
                            lower
                        } else {
                            format!(".{}", lower)
                        };
                        claimed_extensions.insert(ext.clone());
                        set.insert(ext);
                    }
                }
                map.insert(cat_key.clone(), set);
            }
        }
    }

    // 2. Add default categories, stripping any extension already claimed by custom category
    for (default_key, default_set) in default_extension_map() {
        if !map.contains_key(&default_key) {
            let mut clean_set = HashSet::new();
            for ext in default_set {
                if !claimed_extensions.contains(&ext) {
                    clean_set.insert(ext);
                }
            }
            map.insert(default_key, clean_set);
        }
    }

    if let Some(other_set) = map.get_mut("other") {
        other_set.clear();
        other_set.insert(".Unassigned (Extension)".to_string());
    } else {
        let mut s = HashSet::new();
        s.insert(".Unassigned (Extension)".to_string());
        map.insert("other".to_string(), s);
    }

    map
}

fn get_category_for_ext(ext: &str, ext_map: &HashMap<String, HashSet<String>>) -> String {
    let lower = ext.to_lowercase();
    for (cat, set) in ext_map {
        if cat != "other" && set.contains(&lower) {
            return cat.clone();
        }
    }
    "other".to_string()
}

// -----------------------------------------------------------------------------
// Commands
// -----------------------------------------------------------------------------

#[tauri::command]
fn get_drives() -> Vec<DriveInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut drives = Vec::new();

    for disk in &disks {
        let mount = disk.mount_point().to_string_lossy().to_string();
        let vol_name = disk.name().to_string_lossy().to_string();
        let display_name = if !vol_name.is_empty() {
            format!("{} ({})", vol_name, mount.trim_end_matches('\\'))
        } else {
            format!("Local Disk ({})", mount.trim_end_matches('\\'))
        };

        let norm_path = if mount.ends_with('\\') {
            mount
        } else {
            format!("{}\\", mount)
        };

        drives.push(DriveInfo {
            name: display_name,
            path: norm_path,
            size: disk.total_space(),
            free: disk.available_space(),
        });
    }

    if drives.is_empty() {
        // Fallback for Windows drives
        for letter in ['C', 'D', 'E', 'F'] {
            let path_str = format!("{}:\\", letter);
            if Path::new(&path_str).exists() {
                drives.push(DriveInfo {
                    name: format!("Local Disk ({}:)", letter),
                    path: path_str,
                    size: 0,
                    free: 0,
                });
            }
        }
    }

    // Sort drives alphabetically so C:\ always appears first, then D:\, E:\, etc.
    drives.sort_by(|a, b| a.path.to_uppercase().cmp(&b.path.to_uppercase()));

    drives
}

#[tauri::command]
fn read_folder(folder_path: String, custom_categories: Option<serde_json::Value>) -> FolderReadResult {
    let p = Path::new(&folder_path);
    if !p.exists() {
        return FolderReadResult {
            success: false,
            error: Some("Folder does not exist".into()),
            items: Vec::new(),
        };
    }

    let ext_map = build_ext_map(custom_categories.as_ref());
    let mut items = Vec::new();

    let read_dir = match fs::read_dir(p) {
        Ok(rd) => rd,
        Err(e) => {
            return FolderReadResult {
                success: false,
                error: Some(e.to_string()),
                items: Vec::new(),
            };
        }
    };

    for entry_res in read_dir {
        if let Ok(entry) = entry_res {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.starts_with('$') || file_name == "System Volume Information" {
                continue;
            }

            let path_buf = entry.path();
            let is_dir = path_buf.is_dir();
            let ext = if is_dir {
                String::new()
            } else {
                path_buf
                    .extension()
                    .and_then(|s| s.to_str())
                    .map(|e| format!(".{}", e))
                    .unwrap_or_default()
            };

            let category = if is_dir {
                "folder".to_string()
            } else {
                get_category_for_ext(&ext, &ext_map)
            };

            let (size, mtime_ms) = if let Ok(meta) = entry.metadata() {
                let sz = meta.len();
                let mt = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                (sz, mt)
            } else {
                (0, 0)
            };

            items.push(FileItem {
                name: file_name,
                path: path_buf.to_string_lossy().to_string(),
                is_directory: is_dir,
                extension: ext.to_lowercase(),
                category,
                size,
                mtime_ms,
            });
        }
    }

    items.sort_by(|a, b| {
        if a.is_directory && !b.is_directory {
            std::cmp::Ordering::Less
        } else if !a.is_directory && b.is_directory {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    FolderReadResult {
        success: true,
        error: None,
        items,
    }
}

#[tauri::command]
fn open_path(target_path: String) -> Result<(), String> {
    open::that(&target_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn reveal_in_explorer(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = std::process::Command::new("explorer")
            .args(["/select,", &file_path])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = open::that(&file_path);
    }
    Ok(())
}

#[cfg(target_os = "windows")]
mod windows_thumb {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use base64::Engine;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct GUID {
        data1: u32,
        data2: u16,
        data3: u16,
        data4: [u8; 8],
    }

    #[repr(C)]
    struct SIZE {
        cx: i32,
        cy: i32,
    }

    #[repr(C)]
    struct IUnknownVtbl {
        pub query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
        pub add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
    }

    #[repr(C)]
    struct IUnknown {
        pub vtbl: *const IUnknownVtbl,
    }

    #[repr(C)]
    struct IShellItemImageFactoryVtbl {
        pub query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
        pub add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub get_image: unsafe extern "system" fn(*mut c_void, SIZE, u32, *mut *mut c_void) -> i32,
    }

    #[repr(C)]
    struct IShellItemImageFactory {
        pub vtbl: *const IShellItemImageFactoryVtbl,
    }

    #[repr(C)]
    struct BITMAP {
        pub bm_type: i32,
        pub bm_width: i32,
        pub bm_height: i32,
        pub bm_width_bytes: i32,
        pub bm_planes: u16,
        pub bm_bits_pixel: u16,
        pub bm_bits: *mut c_void,
    }

    #[repr(C)]
    struct BITMAPINFOHEADER {
        pub bi_size: u32,
        pub bi_width: i32,
        pub bi_height: i32,
        pub bi_planes: u16,
        pub bi_bit_count: u16,
        pub bi_compression: u32,
        pub bi_size_image: u32,
        pub bi_x_pels_per_meter: i32,
        pub bi_y_pels_per_meter: i32,
        pub bi_clr_used: u32,
        pub bi_clr_important: u32,
    }

    #[link(name = "shell32")]
    extern "system" {
        fn SHCreateItemFromParsingName(
            psz_path: *const u16,
            pbc: *mut c_void,
            riid: *const GUID,
            ppv: *mut *mut c_void,
        ) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn GetObjectW(h: *mut c_void, c: i32, pv: *mut c_void) -> i32;
        fn DeleteObject(ho: *mut c_void) -> i32;
        fn GetDIBits(
            hdc: *mut c_void,
            hbm: *mut c_void,
            start: u32,
            c_lines: u32,
            lpv_bits: *mut c_void,
            lpbmi: *mut c_void,
            usage: u32,
        ) -> i32;
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetDC(hwnd: *mut c_void) -> *mut c_void;
        fn ReleaseDC(hwnd: *mut c_void, hdc: *mut c_void) -> i32;
    }

    #[link(name = "ole32")]
    extern "system" {
        fn CoInitializeEx(pv_reserved: *mut c_void, dw_co_init: u32) -> i32;
    }

    const IID_ISHELL_ITEM: GUID = GUID {
        data1: 0x43826d1e,
        data2: 0xe718,
        data3: 0x42ee,
        data4: [0xbc, 0x55, 0xa1, 0xe2, 0x61, 0xc3, 0x7b, 0xfe],
    };

    const IID_ISHELL_ITEM_IMAGE_FACTORY: GUID = GUID {
        data1: 0xbcc18b79,
        data2: 0xba16,
        data3: 0x442f,
        data4: [0x80, 0xc4, 0x8a, 0x59, 0xc3, 0x0c, 0x46, 0x3b],
    };

    pub fn extract_shell_thumbnail(file_path: &str, width: i32, height: i32) -> Option<String> {
        let path = Path::new(file_path);
        if !path.exists() {
            return None;
        }

        let mut wide_path: Vec<u16> = path.as_os_str().encode_wide().collect();
        wide_path.push(0);

        unsafe {
            let _ = CoInitializeEx(std::ptr::null_mut(), 0x2);

            let mut item_ptr: *mut c_void = std::ptr::null_mut();
            let hr = SHCreateItemFromParsingName(
                wide_path.as_ptr(),
                std::ptr::null_mut(),
                &IID_ISHELL_ITEM,
                &mut item_ptr,
            );

            if hr != 0 || item_ptr.is_null() {
                return None;
            }

            let unk = item_ptr as *mut IUnknown;
            let mut factory_ptr: *mut c_void = std::ptr::null_mut();
            let qi_hr = ((*(*unk).vtbl).query_interface)(
                item_ptr,
                &IID_ISHELL_ITEM_IMAGE_FACTORY,
                &mut factory_ptr,
            );

            let _ = ((*(*unk).vtbl).release)(item_ptr);

            if qi_hr != 0 || factory_ptr.is_null() {
                return None;
            }

            let factory = factory_ptr as *mut IShellItemImageFactory;
            let mut hbitmap: *mut c_void = std::ptr::null_mut();

            // 0x0 = default (fast from Windows cache)
            let get_img_hr = ((*(*factory).vtbl).get_image)(
                factory_ptr,
                SIZE { cx: width, cy: height },
                0x0,
                &mut hbitmap,
            );

            let _ = ((*(*factory).vtbl).release)(factory_ptr);

            if get_img_hr != 0 || hbitmap.is_null() {
                return None;
            }

            let hdc = GetDC(std::ptr::null_mut());
            let mut bmp: BITMAP = std::mem::zeroed();
            let obj_res = GetObjectW(
                hbitmap,
                std::mem::size_of::<BITMAP>() as i32,
                &mut bmp as *mut _ as *mut c_void,
            );

            if obj_res == 0 || bmp.bm_width <= 0 || bmp.bm_height <= 0 {
                ReleaseDC(std::ptr::null_mut(), hdc);
                DeleteObject(hbitmap);
                return None;
            }

            let w = bmp.bm_width;
            let h = bmp.bm_height.abs();
            let row_stride = ((w * 32 + 31) / 32) * 4;
            let data_size = (row_stride * h) as usize;
            let mut pixel_bytes = vec![0u8; data_size];

            let mut header: BITMAPINFOHEADER = std::mem::zeroed();
            header.bi_size = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
            header.bi_width = w;
            header.bi_height = h;
            header.bi_planes = 1;
            header.bi_bit_count = 32;
            header.bi_compression = 0;
            header.bi_size_image = data_size as u32;

            let lines = GetDIBits(
                hdc,
                hbitmap,
                0,
                h as u32,
                pixel_bytes.as_mut_ptr() as *mut c_void,
                &mut header as *mut _ as *mut c_void,
                0,
            );

            ReleaseDC(std::ptr::null_mut(), hdc);
            DeleteObject(hbitmap);

            if lines == 0 {
                return None;
            }

            let file_size = 14 + 40 + data_size as u32;
            let mut bmp_file = Vec::with_capacity(14 + 40 + data_size);

            // BITMAPFILEHEADER
            bmp_file.extend_from_slice(b"BM");
            bmp_file.extend_from_slice(&file_size.to_le_bytes());
            bmp_file.extend_from_slice(&0u32.to_le_bytes());
            bmp_file.extend_from_slice(&54u32.to_le_bytes());

            // BITMAPINFOHEADER
            let header_bytes = std::slice::from_raw_parts(
                &header as *const _ as *const u8,
                std::mem::size_of::<BITMAPINFOHEADER>(),
            );
            bmp_file.extend_from_slice(header_bytes);
            bmp_file.extend_from_slice(&pixel_bytes);

            let encoded = base64::engine::general_purpose::STANDARD.encode(&bmp_file);
            Some(format!("data:image/bmp;base64,{}", encoded))
        }
    }
}

static THUMBNAIL_CACHE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

#[tauri::command]
fn get_thumbnail(file_path: String) -> Option<String> {
    if file_path.is_empty() {
        return None;
    }

    if let Ok(guard) = THUMBNAIL_CACHE.lock() {
        if let Some(ref cache) = *guard {
            if let Some(cached) = cache.get(&file_path) {
                return Some(cached.clone());
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(data_url) = windows_thumb::extract_shell_thumbnail(&file_path, 256, 192) {
            if let Ok(mut guard) = THUMBNAIL_CACHE.lock() {
                let cache = guard.get_or_insert_with(HashMap::new);
                if cache.len() >= 2000 {
                    cache.clear();
                }
                cache.insert(file_path, data_url.clone());
            }
            return Some(data_url);
        }
    }

    None
}

#[tauri::command]
fn toggle_maximize_window(window: tauri::Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn close_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
fn is_window_maximized(window: tauri::Window) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
fn copy_files_to_clipboard(file_paths: Vec<String>, is_cut: Option<bool>) -> Result<bool, String> {
    if file_paths.is_empty() {
        return Ok(false);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let escaped: Vec<String> = file_paths
            .iter()
            .map(|p| format!("'{}'", p.replace('\'', "''")))
            .collect();

        let cut_flag = is_cut.unwrap_or(false);
        let cmd = if cut_flag {
            format!(
                "$paths = @({}); \
                Add-Type -AssemblyName System.Windows.Forms; \
                $files = New-Object System.Collections.Specialized.StringCollection; \
                $paths | ForEach-Object {{ $files.Add($_) }}; \
                $data = New-Object System.Windows.Forms.DataObject; \
                $data.SetFileDropList($files); \
                $ms = New-Object System.IO.MemoryStream; \
                $ms.WriteByte(2); $ms.WriteByte(0); $ms.WriteByte(0); $ms.WriteByte(0); \
                $data.SetData('Preferred DropEffect', $ms); \
                [System.Windows.Forms.Clipboard]::SetDataObject($data, $true)",
                escaped.join(", ")
            )
        } else {
            format!("Set-Clipboard -Path @({})", escaped.join(", "))
        };

        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &cmd])
            .creation_flags(CREATE_NO_WINDOW)
            .status();

        match status {
            Ok(s) => Ok(s.success()),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn get_autostart_status() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::c_void;
        use std::os::windows::ffi::OsStrExt;
        use std::path::Path;

        #[link(name = "advapi32")]
        extern "system" {
            fn RegOpenKeyExW(hkey: *mut c_void, sub_key: *const u16, opt: u32, sam: u32, phk: *mut *mut c_void) -> i32;
            fn RegCloseKey(hkey: *mut c_void) -> i32;
            fn RegQueryValueExW(hkey: *mut c_void, val_name: *const u16, rsv: *mut u32, ptype: *mut u32, pdata: *mut u8, psize: *mut u32) -> i32;
        }

        const HKEY_CURRENT_USER: *mut c_void = 0x80000001u32 as usize as *mut c_void;
        const KEY_READ: u32 = 0x20019;

        let run_subkey: Vec<u16> = Path::new("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let approved_subkey: Vec<u16> = Path::new("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run")
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let val_name: Vec<u16> = Path::new("SimpleMediaOrganizer")
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            // First check if present in Run
            let mut hkey: *mut c_void = std::ptr::null_mut();
            if RegOpenKeyExW(HKEY_CURRENT_USER, run_subkey.as_ptr(), 0, KEY_READ, &mut hkey) == 0 {
                let mut size: u32 = 0;
                let res = RegQueryValueExW(hkey, val_name.as_ptr(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), &mut size);
                let _ = RegCloseKey(hkey);
                if res != 0 || size == 0 {
                    return false;
                }
            } else {
                return false;
            }

            // Second check StartupApproved state (used by Windows Task Manager)
            let mut app_key: *mut c_void = std::ptr::null_mut();
            if RegOpenKeyExW(HKEY_CURRENT_USER, approved_subkey.as_ptr(), 0, KEY_READ, &mut app_key) == 0 {
                let mut buf = [0u8; 16];
                let mut size = buf.len() as u32;
                let mut vtype: u32 = 0;
                let res = RegQueryValueExW(app_key, val_name.as_ptr(), std::ptr::null_mut(), &mut vtype, buf.as_mut_ptr(), &mut size);
                let _ = RegCloseKey(app_key);
                if res == 0 && size > 0 {
                    // In Windows Task Manager:
                    // 0x02 or 0x06 = Enabled
                    // 0x03 or other = Disabled
                    return buf[0] == 0x02 || buf[0] == 0x06;
                }
            }

            return true;
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
fn set_autostart_status(enabled: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::{c_void, OsStr};
        use std::os::windows::ffi::OsStrExt;
        use std::path::Path;

        #[link(name = "advapi32")]
        extern "system" {
            fn RegCreateKeyExW(hkey: *mut c_void, sub_key: *const u16, rsv: u32, pclass: *mut u16, opt: u32, sam: u32, sec: *mut c_void, phk: *mut *mut c_void, pdisp: *mut u32) -> i32;
            fn RegCloseKey(hkey: *mut c_void) -> i32;
            fn RegSetValueExW(hkey: *mut c_void, val_name: *const u16, rsv: u32, ptype: u32, pdata: *const u8, psize: u32) -> i32;
        }

        const HKEY_CURRENT_USER: *mut c_void = 0x80000001u32 as usize as *mut c_void;
        const KEY_ALL_ACCESS: u32 = 0xF003F;
        const REG_SZ: u32 = 1;
        const REG_BINARY: u32 = 3;

        let run_subkey: Vec<u16> = Path::new("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let approved_subkey: Vec<u16> = Path::new("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run")
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let val_name: Vec<u16> = Path::new("SimpleMediaOrganizer")
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            // 1. Ensure Run key has current exe path with quotes and --minimized
            let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let exe_str = current_exe.to_string_lossy().to_string();
            let reg_val = format!("\"{}\" --minimized", exe_str);
            let wide_val: Vec<u16> = OsStr::new(&reg_val)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let val_bytes = std::slice::from_raw_parts(wide_val.as_ptr() as *const u8, wide_val.len() * 2);

            let mut run_key: *mut c_void = std::ptr::null_mut();
            if RegCreateKeyExW(HKEY_CURRENT_USER, run_subkey.as_ptr(), 0, std::ptr::null_mut(), 0, KEY_ALL_ACCESS, std::ptr::null_mut(), &mut run_key, std::ptr::null_mut()) == 0 {
                let _ = RegSetValueExW(run_key, val_name.as_ptr(), 0, REG_SZ, val_bytes.as_ptr(), val_bytes.len() as u32);
                let _ = RegCloseKey(run_key);
            }

            // 2. Set StartupApproved state so Windows Task Manager immediately reflects Enabled / Disabled
            let mut app_key: *mut c_void = std::ptr::null_mut();
            if RegCreateKeyExW(HKEY_CURRENT_USER, approved_subkey.as_ptr(), 0, std::ptr::null_mut(), 0, KEY_ALL_ACCESS, std::ptr::null_mut(), &mut app_key, std::ptr::null_mut()) == 0 {
                let mut bin_data = [0u8; 12];
                bin_data[0] = if enabled { 0x02 } else { 0x03 };
                let _ = RegSetValueExW(app_key, val_name.as_ptr(), 0, REG_BINARY, bin_data.as_ptr(), bin_data.len() as u32);
                let _ = RegCloseKey(app_key);
            }
        }
        return Ok(enabled);
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

fn ensure_startup_registration() {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::{c_void, OsStr};
        use std::os::windows::ffi::OsStrExt;
        use std::path::Path;

        #[link(name = "advapi32")]
        extern "system" {
            fn RegOpenKeyExW(hkey: *mut c_void, sub_key: *const u16, opt: u32, sam: u32, phk: *mut *mut c_void) -> i32;
            fn RegCreateKeyExW(hkey: *mut c_void, sub_key: *const u16, rsv: u32, pclass: *mut u16, opt: u32, sam: u32, sec: *mut c_void, phk: *mut *mut c_void, pdisp: *mut u32) -> i32;
            fn RegCloseKey(hkey: *mut c_void) -> i32;
            fn RegQueryValueExW(hkey: *mut c_void, val_name: *const u16, rsv: *mut u32, ptype: *mut u32, pdata: *mut u8, psize: *mut u32) -> i32;
            fn RegSetValueExW(hkey: *mut c_void, val_name: *const u16, rsv: u32, ptype: u32, pdata: *const u8, psize: u32) -> i32;
        }

        const HKEY_CURRENT_USER: *mut c_void = 0x80000001u32 as usize as *mut c_void;
        const KEY_READ: u32 = 0x20019;
        const KEY_ALL_ACCESS: u32 = 0xF003F;
        const REG_SZ: u32 = 1;
        const REG_BINARY: u32 = 3;

        let run_subkey: Vec<u16> = Path::new("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let approved_subkey: Vec<u16> = Path::new("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run")
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let val_name: Vec<u16> = Path::new("SimpleMediaOrganizer")
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let mut hkey: *mut c_void = std::ptr::null_mut();
            let mut exists = false;
            if RegOpenKeyExW(HKEY_CURRENT_USER, run_subkey.as_ptr(), 0, KEY_READ, &mut hkey) == 0 {
                let mut size: u32 = 0;
                if RegQueryValueExW(hkey, val_name.as_ptr(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), &mut size) == 0 && size > 0 {
                    exists = true;
                }
                let _ = RegCloseKey(hkey);
            }

            if let Ok(current_exe) = std::env::current_exe() {
                let exe_str = current_exe.to_string_lossy().to_string();
                let reg_val = format!("\"{}\" --minimized", exe_str);
                let wide_val: Vec<u16> = OsStr::new(&reg_val)
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                let val_bytes = std::slice::from_raw_parts(wide_val.as_ptr() as *const u8, wide_val.len() * 2);

                let mut run_k: *mut c_void = std::ptr::null_mut();
                if RegCreateKeyExW(HKEY_CURRENT_USER, run_subkey.as_ptr(), 0, std::ptr::null_mut(), 0, KEY_ALL_ACCESS, std::ptr::null_mut(), &mut run_k, std::ptr::null_mut()) == 0 {
                    let _ = RegSetValueExW(run_k, val_name.as_ptr(), 0, REG_SZ, val_bytes.as_ptr(), val_bytes.len() as u32);
                    let _ = RegCloseKey(run_k);
                }

                if !exists {
                    let mut app_k: *mut c_void = std::ptr::null_mut();
                    if RegCreateKeyExW(HKEY_CURRENT_USER, approved_subkey.as_ptr(), 0, std::ptr::null_mut(), 0, KEY_ALL_ACCESS, std::ptr::null_mut(), &mut app_k, std::ptr::null_mut()) == 0 {
                        let mut bin_data = [0u8; 12];
                        bin_data[0] = 0x02; // Enabled by default
                        let _ = RegSetValueExW(app_k, val_name.as_ptr(), 0, REG_BINARY, bin_data.as_ptr(), bin_data.len() as u32);
                        let _ = RegCloseKey(app_k);
                    }
                }
            }
        }
    }
}

#[tauri::command]
async fn start_native_drag<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    paths: Vec<String>,
) -> Result<(), String> {
    let mut files = Vec::new();
    for p in paths {
        let pb = std::path::PathBuf::from(&p);
        if pb.exists() {
            files.push(pb);
        }
    }

    if files.is_empty() {
        return Err("No valid files or folders to drag".into());
    }

    const PNG_BYTES: &[u8] = include_bytes!("../icons/32x32.png");
    let image = drag::Image::Raw(PNG_BYTES.to_vec());

    let _ = app.run_on_main_thread(move || {
        let raw_window = window.clone();
        let _ = drag::start_drag(
            &raw_window,
            drag::DragItem::Files(files),
            image,
            |_result, _pos| {},
            drag::Options::default(),
        );
    });

    Ok(())
}

#[tauri::command]
fn delete_file(file_path: String) -> FileOpResult {
    let p = Path::new(&file_path);
    if !p.exists() {
        return FileOpResult {
            success: false,
            error: Some("File does not exist".into()),
            recycled: Some(false),
        };
    }

    match trash::delete(p) {
        Ok(_) => FileOpResult {
            success: true,
            error: None,
            recycled: Some(true),
        },
        Err(e) => {
            // Fallback to permanent delete if trash fails
            let res = if p.is_dir() {
                fs::remove_dir_all(p)
            } else {
                fs::remove_file(p)
            };
            match res {
                Ok(_) => FileOpResult {
                    success: true,
                    error: None,
                    recycled: Some(false),
                },
                Err(err) => FileOpResult {
                    success: false,
                    error: Some(format!("Recycle error: {}; Delete error: {}", e, err)),
                    recycled: Some(false),
                },
            }
        }
    }
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> FileOpResult {
    match fs::rename(&old_path, &new_path) {
        Ok(_) => FileOpResult {
            success: true,
            error: None,
            recycled: None,
        },
        Err(e) => FileOpResult {
            success: false,
            error: Some(e.to_string()),
            recycled: None,
        },
    }
}

#[tauri::command]
fn copy_file(src: String, dest: String) -> FileOpResult {
    match fs::copy(&src, &dest) {
        Ok(_) => FileOpResult {
            success: true,
            error: None,
            recycled: None,
        },
        Err(e) => FileOpResult {
            success: false,
            error: Some(e.to_string()),
            recycled: None,
        },
    }
}

#[tauri::command]
fn move_file(src: String, dest: String) -> FileOpResult {
    match fs::rename(&src, &dest) {
        Ok(_) => FileOpResult {
            success: true,
            error: None,
            recycled: None,
        },
        Err(e) => FileOpResult {
            success: false,
            error: Some(e.to_string()),
            recycled: None,
        },
    }
}

// -----------------------------------------------------------------------------
// Auto-Organizer Service
// -----------------------------------------------------------------------------

#[tauri::command]
fn get_organizer_tasks(app: tauri::AppHandle) -> Vec<OrganizerTask> {
    let path = get_storage_path(&app, "smo-organizer-tasks.json");
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(tasks) = serde_json::from_str::<Vec<OrganizerTask>>(&content) {
                return tasks;
            }
        }
    }
    Vec::new()
}

#[tauri::command]
fn save_organizer_tasks(
    app: tauri::AppHandle,
    state: State<'_, TrayState>,
    tasks: Vec<OrganizerTask>,
) -> Result<bool, String> {
    let path = get_storage_path(&app, "smo-organizer-tasks.json");
    let json_data = serde_json::to_string_pretty(&tasks).map_err(|e| e.to_string())?;
    fs::write(&path, json_data).map_err(|e| e.to_string())?;

    // Update system tray menu dynamically with new tasks
    let _ = update_tray_menu(&app, &state, &tasks);

    Ok(true)
}

fn execute_single_organizer_task(
    task: &mut OrganizerTask,
    custom_categories: Option<&serde_json::Value>,
) -> OrganizerResult {
    let source_path = Path::new(&task.source_folder);
    if !source_path.exists() {
        return OrganizerResult {
            success: false,
            error: Some("Source folder does not exist".into()),
            moved_count: 0,
            errors: Vec::new(),
        };
    }

    let ext_map = build_ext_map(custom_categories);

    let mut folder_name_map: HashMap<String, String> = HashMap::new();
    folder_name_map.insert("image".into(), "Images".into());
    folder_name_map.insert("video".into(), "Videos".into());
    folder_name_map.insert("audio".into(), "Audio".into());
    folder_name_map.insert("document".into(), "Documents".into());
    folder_name_map.insert("archive".into(), "Archives".into());
    folder_name_map.insert("app".into(), "Applications".into());
    folder_name_map.insert("other".into(), "Other Files".into());

    if let Some(serde_json::Value::Object(obj)) = custom_categories {
        for (k, val) in obj {
            if let Some(fn_val) = val.get("folderName").and_then(|v| v.as_str()) {
                folder_name_map.insert(k.clone(), fn_val.to_string());
            }
        }
    }

    let reserved_subdirs: HashSet<String> = folder_name_map.values().cloned().collect();
    let other_sub = folder_name_map
        .get("other")
        .cloned()
        .unwrap_or_else(|| "Other Files".into());
    let other_target_dir = source_path.join(&other_sub);

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let one_day_ago = now_ms.saturating_sub(24 * 60 * 60 * 1000);

    let mut moved_count = 0;
    let mut errors = Vec::new();

    if let Ok(entries) = fs::read_dir(source_path) {
        for entry_res in entries {
            if let Ok(entry) = entry_res {
                let path = entry.path();
                if path.is_file() {
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| format!(".{}", e))
                        .unwrap_or_default();
                    let category = get_category_for_ext(&ext, &ext_map);

                    if task.move_newer_only.unwrap_or(false) {
                        if let Ok(meta) = entry.metadata() {
                            let mtime = meta
                                .modified()
                                .ok()
                                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);
                            if mtime < one_day_ago {
                                continue;
                            }
                        }
                    }

                    let target_sub = folder_name_map
                        .get(&category)
                        .cloned()
                        .unwrap_or_else(|| "Other Files".into());
                    let target_dir = source_path.join(target_sub);
                    let _ = fs::create_dir_all(&target_dir);

                    let file_name = entry.file_name();
                    let mut dest_path = target_dir.join(&file_name);

                    // If a file with the same name already exists in target_dir, generate a unique name
                    if dest_path.exists() && dest_path != path {
                        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
                        let ext_str = path.extension().and_then(|e| e.to_str()).map(|e| format!(".{}", e)).unwrap_or_default();
                        let mut counter = 1;
                        loop {
                            let candidate = target_dir.join(format!("{} ({}){}", stem, counter, ext_str));
                            if !candidate.exists() {
                                dest_path = candidate;
                                break;
                            }
                            counter += 1;
                        }
                    }

                    if dest_path != path {
                        match fs::rename(&path, &dest_path) {
                            Ok(_) => moved_count += 1,
                            Err(_) => {
                                // Fallback to copy + remove for cross-device or permission edge cases
                                match fs::copy(&path, &dest_path) {
                                    Ok(_) => {
                                        let _ = fs::remove_file(&path);
                                        moved_count += 1;
                                    }
                                    Err(e) => {
                                        errors.push(format!(
                                            "{}: {}",
                                            file_name.to_string_lossy(),
                                            e
                                        ));
                                    }
                                }
                            }
                        }
                    }
                } else if path.is_dir() {
                    let dir_name = entry.file_name().to_string_lossy().to_string();
                    if !reserved_subdirs.contains(&dir_name) && !dir_name.starts_with('.') {
                        let _ = fs::create_dir_all(&other_target_dir);
                        let mut dest_dir = other_target_dir.join(&dir_name);

                        if dest_dir.exists() && dest_dir != path {
                            let mut counter = 1;
                            loop {
                                let candidate = other_target_dir.join(format!("{} ({})", dir_name, counter));
                                if !candidate.exists() {
                                    dest_dir = candidate;
                                    break;
                                }
                                counter += 1;
                            }
                        }

                        if dest_dir != path {
                            match fs::rename(&path, &dest_dir) {
                                Ok(_) => moved_count += 1,
                                Err(_) => {
                                    errors.push(format!(
                                        "{}: Could not move directory into Other Files",
                                        dir_name
                                    ));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    task.last_run = Some(now_ms);

    let success = errors.is_empty() || moved_count > 0;
    OrganizerResult {
        success,
        error: if !errors.is_empty() && moved_count == 0 {
            Some(errors.join("; "))
        } else {
            None
        },
        moved_count,
        errors,
    }
}

#[tauri::command]
fn run_organizer_task(
    app: tauri::AppHandle,
    mut task: OrganizerTask,
    custom_categories: Option<serde_json::Value>,
) -> OrganizerResult {
    let res = execute_single_organizer_task(&mut task, custom_categories.as_ref());

    // Update task lastRun in storage if task has an id
    if let Some(ref task_id) = task.id {
        let mut tasks = get_organizer_tasks(app.clone());
        if let Some(pos) = tasks.iter().position(|t| t.id.as_ref() == Some(task_id)) {
            tasks[pos].last_run = task.last_run;
            let path = get_storage_path(&app, "smo-organizer-tasks.json");
            let _ = fs::write(&path, serde_json::to_string_pretty(&tasks).unwrap_or_default());
        }
    }

    res
}

#[tauri::command]
fn run_all_organizer_tasks(app: tauri::AppHandle) -> Result<u32, String> {
    let mut tasks = get_organizer_tasks(app.clone());
    let mut total_moved = 0;

    for task in tasks.iter_mut() {
        if task.enabled.unwrap_or(true) {
            let res = execute_single_organizer_task(task, None);
            if res.success {
                total_moved += res.moved_count;
            }
        }
    }

    let path = get_storage_path(&app, "smo-organizer-tasks.json");
    let _ = fs::write(&path, serde_json::to_string_pretty(&tasks).unwrap_or_default());

    let _ = app.emit("organizer:completed", serde_json::json!({ "totalMoved": total_moved }));

    Ok(total_moved)
}

// -----------------------------------------------------------------------------
// Ignore Rules Service
// -----------------------------------------------------------------------------

#[tauri::command]
fn get_ignore_rules(app: tauri::AppHandle) -> Vec<serde_json::Value> {
    let path = get_storage_path(&app, "smo-ignore-rules.json");
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(rules) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                return rules;
            }
        }
    }
    Vec::new()
}

#[tauri::command]
fn save_ignore_rules(app: tauri::AppHandle, rules: Vec<serde_json::Value>) -> Result<bool, String> {
    let path = get_storage_path(&app, "smo-ignore-rules.json");
    let json_data = serde_json::to_string_pretty(&rules).map_err(|e| e.to_string())?;
    fs::write(&path, json_data).map_err(|e| e.to_string())?;
    Ok(true)
}

// -----------------------------------------------------------------------------
// High-Speed Fast Scanner
// -----------------------------------------------------------------------------

fn matches_pattern(name: &str, is_dir: bool, pattern: &str) -> bool {
    let p = pattern.trim();
    if p.is_empty() {
        return false;
    }

    if p.ends_with('/') || p.starts_with('/') {
        let clean = p.trim_matches('/').to_lowercase();
        return is_dir && name.to_lowercase() == clean;
    }

    let p_lower = p.to_lowercase();
    let name_lower = name.to_lowercase();

    if name_lower == p_lower {
        return true;
    }

    if p_lower.starts_with("*.") {
        let ext = &p_lower[1..];
        return !is_dir && name_lower.ends_with(ext);
    }

    if p_lower.ends_with('*') && !p_lower.starts_with('*') {
        let prefix = &p_lower[..p_lower.len() - 1];
        return name_lower.starts_with(prefix);
    }

    false
}

fn should_ignore_entry(name: &str, is_dir: bool, parent_dir: &str, rules: &[serde_json::Value]) -> bool {
    let hardcoded = [
        "$RECYCLE.BIN",
        "System Volume Information",
        "node_modules",
        ".git",
        ".svn",
        "Windows",
        "Program Files",
        "Program Files (x86)",
        "AppData",
        "Recovery",
    ];

    if is_dir && (hardcoded.contains(&name) || name.starts_with('.')) {
        return true;
    }

    let normalized_parent = parent_dir.replace('\\', "/").to_lowercase();

    for rule in rules {
        if rule.get("enabled").and_then(|v| v.as_bool()) == Some(false) {
            continue;
        }

        let folder_scope = rule.get("folder").and_then(|v| v.as_str()).unwrap_or("All");
        let applies = if folder_scope == "All" || folder_scope == "Global" {
            true
        } else {
            let normalized_scope = folder_scope.replace('\\', "/").to_lowercase();
            let clean_scope = normalized_scope.trim_end_matches('/');
            normalized_parent == clean_scope || normalized_parent.starts_with(&format!("{}/", clean_scope))
        };

        if !applies {
            continue;
        }

        if let Some(patterns) = rule.get("patterns").and_then(|v| v.as_array()) {
            for pat_val in patterns {
                if let Some(pat) = pat_val.as_str() {
                    if matches_pattern(name, is_dir, pat) {
                        return true;
                    }
                }
            }
        }
    }

    false
}

#[tauri::command]
fn cancel_fast_scan() {
    CANCEL_SCAN.store(true, Ordering::SeqCst);
}

#[tauri::command]
async fn start_fast_scan(
    app: tauri::AppHandle,
    root_path: String,
    custom_categories: Option<serde_json::Value>,
) -> Result<(), String> {
    CANCEL_SCAN.store(false, Ordering::SeqCst);

    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(&root_path);
        if !root.exists() {
            let _ = app.emit(
                "scan:complete",
                ScanCompletePayload {
                    success: false,
                    summary: serde_json::json!({}),
                    folders: Vec::new(),
                    error: Some("Path does not exist".into()),
                },
            );
            return;
        }

        let ext_map = build_ext_map(custom_categories.as_ref());
        let ignore_rules = get_ignore_rules(app.clone());

        let mut summary: HashMap<String, CategorySummary> = HashMap::new();
        for key in ext_map.keys() {
            summary.insert(key.clone(), CategorySummary { count: 0, size: 0 });
        }
        summary.insert("other".into(), CategorySummary { count: 0, size: 0 });

        let mut queue = std::collections::VecDeque::new();
        queue.push_back(root.to_path_buf());

        let mut folder_map: HashMap<String, FolderInfo> = HashMap::new();
        let mut processed_dirs: u32 = 0;
        let mut total_files: u32 = 0;
        let start_time = SystemTime::now();
        let mut last_summary_emit = SystemTime::now();
        let mut last_folder_emit = SystemTime::now();

        while let Some(current_dir) = queue.pop_front() {
            if CANCEL_SCAN.load(Ordering::SeqCst) {
                break;
            }

            processed_dirs += 1;
            let current_dir_str = current_dir.to_string_lossy().to_string();

            if let Ok(entries) = fs::read_dir(&current_dir) {
                for entry_res in entries {
                    if CANCEL_SCAN.load(Ordering::SeqCst) {
                        break;
                    }

                    if let Ok(entry) = entry_res {
                        // High-speed file_type query: Zero disk stat system calls on Windows!
                        // Reads directly from cached WIN32_FIND_DATAW in memory.
                        let is_dir = match entry.file_type() {
                            Ok(ft) => ft.is_dir(),
                            Err(_) => continue,
                        };

                        let name_os = entry.file_name();
                        let name = name_os.to_string_lossy();

                        if should_ignore_entry(&name, is_dir, &current_dir_str, &ignore_rules) {
                            continue;
                        }

                        if is_dir {
                            queue.push_back(entry.path());
                        } else {
                            // Extract extension without allocating PathBuf
                            let ext = match name.rfind('.') {
                                Some(idx) => &name[idx..],
                                None => "",
                            };
                            let cat = get_category_for_ext(ext, &ext_map);

                            total_files += 1;
                            let path = entry.path();

                            let (size, mtime_ms) = if let Ok(meta) = entry.metadata() {
                                let sz = meta.len();
                                let mt = meta
                                    .modified()
                                    .ok()
                                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                                    .map(|d| d.as_millis() as u64)
                                    .unwrap_or(0);
                                (sz, mt)
                            } else {
                                (0, 0)
                            };

                            if let Some(c) = summary.get_mut(&cat) {
                                c.count += 1;
                                c.size += size;
                            }

                            let item_data = FileItem {
                                name: name.to_string(),
                                path: path.to_string_lossy().to_string(),
                                is_directory: false,
                                extension: ext.to_lowercase(),
                                category: cat.clone(),
                                size,
                                mtime_ms,
                            };

                            let folder_entry = folder_map.entry(current_dir_str.clone()).or_insert_with(|| {
                                let clean_path = current_dir_str.trim_end_matches(['\\', '/']);
                                let folder_name = Path::new(clean_path)
                                    .file_name()
                                    .and_then(|s| s.to_str())
                                    .map(|s| s.to_string())
                                    .unwrap_or_else(|| current_dir_str.clone());

                                let mut counts = HashMap::new();
                                for k in ext_map.keys() {
                                    counts.insert(k.clone(), 0);
                                }
                                counts.insert("other".into(), 0);

                                FolderInfo {
                                    folder_path: current_dir_str.clone(),
                                    folder_name,
                                    counts,
                                    total_files: 0,
                                    total_size: 0,
                                    latest_item: None,
                                    latest_image: None,
                                    latest_video: None,
                                    latest_audio: None,
                                }
                            });

                            *folder_entry.counts.entry(cat.clone()).or_insert(0) += 1;
                            folder_entry.total_files += 1;
                            folder_entry.total_size += size;

                            let should_update_latest_item = match &folder_entry.latest_item {
                                None => true,
                                Some(curr) => mtime_ms > curr.mtime_ms,
                            };
                            if should_update_latest_item {
                                folder_entry.latest_item = Some(item_data.clone());
                            }

                            if cat == "image" {
                                let should_update_image = match &folder_entry.latest_image {
                                    None => true,
                                    Some(curr) => mtime_ms > curr.mtime_ms,
                                };
                                if should_update_image {
                                    folder_entry.latest_image = Some(item_data.clone());
                                }
                            }

                            if cat == "video" {
                                let should_update_video = match &folder_entry.latest_video {
                                    None => true,
                                    Some(curr) => mtime_ms > curr.mtime_ms,
                                };
                                if should_update_video {
                                    folder_entry.latest_video = Some(item_data.clone());
                                }
                            }

                            if cat == "audio" {
                                let should_update_audio = match &folder_entry.latest_audio {
                                    None => true,
                                    Some(curr) => mtime_ms > curr.mtime_ms,
                                };
                                if should_update_audio {
                                    folder_entry.latest_audio = Some(item_data);
                                }
                            }
                        }
                    }
                }
            }

            // High-speed decoupled emission:
            // Summary counters emit smoothly every 150ms without heavy serialization.
            // Full folders array emits at 700ms intervals to eliminate IPC congestion.
            if let Ok(elapsed) = last_summary_emit.elapsed() {
                if elapsed >= Duration::from_millis(150) {
                    last_summary_emit = SystemTime::now();
                    let duration_ms = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);
                    let summary_val = format_scan_summary(total_files, folder_map.len() as u32, duration_ms, &summary);

                    let should_send_folders = last_folder_emit.elapsed().map(|d| d >= Duration::from_millis(700)).unwrap_or(false);
                    let folders_vec = if should_send_folders {
                        last_folder_emit = SystemTime::now();
                        folder_map.values().cloned().collect()
                    } else {
                        Vec::new()
                    };

                    let payload = ScanProgressPayload {
                        current_dir: current_dir_str,
                        queue_length: queue.len(),
                        processed_dirs,
                        summary: summary_val,
                        folders: folders_vec,
                    };
                    let _ = app.emit("scan:progress", payload);
                }
            }
        }

        if !CANCEL_SCAN.load(Ordering::SeqCst) {
            let duration_ms = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);
            let summary_val = format_scan_summary(total_files, folder_map.len() as u32, duration_ms, &summary);
            let folders_vec: Vec<FolderInfo> = folder_map.into_values().collect();

            let payload = ScanCompletePayload {
                success: true,
                summary: summary_val,
                folders: folders_vec,
                error: None,
            };
            let _ = app.emit("scan:complete", payload);
        }
    });

    Ok(())
}


// -----------------------------------------------------------------------------
// System Tray Menu & Dynamic Update
// -----------------------------------------------------------------------------

fn update_tray_menu(
    app: &tauri::AppHandle,
    state: &State<'_, TrayState>,
    tasks: &[OrganizerTask],
) -> Result<(), Box<dyn std::error::Error>> {
    let tray_guard = state.tray.lock().unwrap();
    let tray = match tray_guard.as_ref() {
        Some(t) => t,
        None => return Ok(()),
    };

    let mut sub_builder = SubmenuBuilder::new(app, "Organizer");
    if tasks.is_empty() {
        let no_tasks = MenuItem::with_id(
            app,
            "tray_no_tasks",
            "No Folders Configured",
            false,
            None::<&str>,
        )?;
        sub_builder = sub_builder.item(&no_tasks);
    } else {
        for (i, t) in tasks.iter().enumerate() {
            let folder_name = Path::new(&t.source_folder)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| t.source_folder.clone());
            let item_label = format!("- /{}", folder_name);
            let item_id = format!("tray_task_{}", i);
            let task_item = MenuItem::with_id(app, item_id, item_label, true, None::<&str>)?;
            sub_builder = sub_builder.item(&task_item);
        }
        let sep_sub = PredefinedMenuItem::separator(app)?;
        let all_item = MenuItem::with_id(app, "tray_all_tasks", "All Folders", true, None::<&str>)?;
        sub_builder = sub_builder.item(&sep_sub).item(&all_item);
    }
    let organizer_submenu = sub_builder.build()?;

    let open_item = MenuItem::with_id(app, "tray_open", "Open Application", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let exit_item = MenuItem::with_id(app, "tray_exit", "Exit", true, None::<&str>)?;

    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .item(&organizer_submenu)
        .item(&sep1)
        .item(&exit_item)
        .build()?;

    tray.set_menu(Some(menu))?;

    Ok(())
}

fn build_initial_tray(app: &tauri::AppHandle) -> Result<TrayIcon, Box<dyn std::error::Error>> {
    let tasks = get_organizer_tasks(app.clone());

    let mut sub_builder = SubmenuBuilder::new(app, "Organizer");
    if tasks.is_empty() {
        let no_tasks = MenuItem::with_id(
            app,
            "tray_no_tasks",
            "No Folders Configured",
            false,
            None::<&str>,
        )?;
        sub_builder = sub_builder.item(&no_tasks);
    } else {
        for (i, t) in tasks.iter().enumerate() {
            let folder_name = Path::new(&t.source_folder)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| t.source_folder.clone());
            let item_label = format!("- /{}", folder_name);
            let item_id = format!("tray_task_{}", i);
            let task_item = MenuItem::with_id(app, item_id, item_label, true, None::<&str>)?;
            sub_builder = sub_builder.item(&task_item);
        }
        let sep_sub = PredefinedMenuItem::separator(app)?;
        let all_item = MenuItem::with_id(app, "tray_all_tasks", "All Folders", true, None::<&str>)?;
        sub_builder = sub_builder.item(&sep_sub).item(&all_item);
    }
    let organizer_submenu = sub_builder.build()?;

    let open_item = MenuItem::with_id(app, "tray_open", "Open Application", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let exit_item = MenuItem::with_id(app, "tray_exit", "Exit", true, None::<&str>)?;

    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .item(&organizer_submenu)
        .item(&sep1)
        .item(&exit_item)
        .build()?;

    let icon = app.default_window_icon().cloned().unwrap();

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("SimpleMediaOrganizer")
        .menu(&menu)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id == "tray_open" {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            } else if id == "tray_exit" {
                app.exit(0);
            } else if id == "tray_all_tasks" {
                let _ = run_all_organizer_tasks(app.clone());
            } else if id.starts_with("tray_task_") {
                if let Ok(idx) = id.replace("tray_task_", "").parse::<usize>() {
                    let tasks = get_organizer_tasks(app.clone());
                    if let Some(task) = tasks.get(idx) {
                        let mut t = task.clone();
                        let res = execute_single_organizer_task(&mut t, None);
                        let _ = app.emit("organizer:completed", serde_json::json!({ "movedCount": res.moved_count }));
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(tray)
}

// -----------------------------------------------------------------------------
// Entry Point
// -----------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_drag::init())
        .manage(TrayState {
            tray: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // Ensure Windows Task Manager Startup registration exists and points to current executable
            ensure_startup_registration();

            // Check if started with --minimized flag (e.g. Windows Run on Startup)
            let is_minimized_arg = std::env::args().any(|a| a == "--minimized");
            if is_minimized_arg {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // Intercept window close to minimize to tray
            if let Some(window) = app.get_webview_window("main") {
                let win_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            // Initialize system tray
            if let Ok(tray) = build_initial_tray(&handle) {
                let state: State<TrayState> = app.state();
                *state.tray.lock().unwrap() = Some(tray);
            }

            // Background scheduler for periodic organizer tasks
            let sched_handle = handle.clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(Duration::from_secs(60));

                    let tasks = get_organizer_tasks(sched_handle.clone());
                    let now_ms = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);

                    for mut task in tasks {
                        if task.enabled.unwrap_or(true) {
                            if let Some(ref sched) = task.schedule_type {
                                let interval_ms: u64 = match sched.as_str() {
                                    "30m" => 30 * 60 * 1000,
                                    "1h" => 60 * 60 * 1000,
                                    "6h" => 6 * 60 * 60 * 1000,
                                    "24h" => 24 * 60 * 60 * 1000,
                                    _ => 0,
                                };

                                if interval_ms > 0 {
                                    let last = task.last_run.unwrap_or(0);
                                    if now_ms.saturating_sub(last) >= interval_ms {
                                        let _ = execute_single_organizer_task(&mut task, None);
                                    }
                                }
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_drives,
            read_folder,
            open_path,
            reveal_in_explorer,
            get_thumbnail,
            toggle_maximize_window,
            minimize_window,
            close_window,
            is_window_maximized,
            copy_files_to_clipboard,
            delete_file,
            rename_file,
            copy_file,
            move_file,
            get_organizer_tasks,
            save_organizer_tasks,
            run_organizer_task,
            run_all_organizer_tasks,
            get_ignore_rules,
            save_ignore_rules,
            start_fast_scan,
            cancel_fast_scan,
            get_autostart_status,
            set_autostart_status,
            start_native_drag,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
