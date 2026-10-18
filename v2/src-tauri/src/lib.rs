use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::menu::{Menu, MenuItemBuilder, MenuItemKind, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Upper bound on how long a user-requested quit waits for the frontend to flush its saves.
const FLUSH_TIMEOUT: Duration = Duration::from_secs(3);

/// Set once a quit has been handed to the frontend, so repeated Cmd+Q presses don't stack.
static QUIT_PENDING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
async fn print_page(webview: tauri::Webview) -> Result<(), String> {
    webview.print().map_err(|e| e.to_string())
}

/// Called by the frontend once its pending saves are flushed (see `app://flush-then-exit`).
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// A user asked to quit: let the frontend flush its debounced saves first. It calls `exit_app`
/// when done; if it never answers, exit anyway after FLUSH_TIMEOUT so quitting can never hang.
fn request_quit<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if QUIT_PENDING.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = app.emit("app://flush-then-exit", ());
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FLUSH_TIMEOUT);
        handle.exit(0);
    });
}

/// Labels of the predefined Quit item: "Quit <app>" (macOS), "&Quit" (Linux), "&Exit" (Windows).
fn is_quit_label(text: &str) -> bool {
    let t = text.replace('&', "");
    t == "Quit" || t == "Exit" || t.starts_with("Quit ")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: "
                CREATE TABLE IF NOT EXISTS notebooks (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS sections (
                    id TEXT PRIMARY KEY,
                    notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    position INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS cards (
                    id TEXT PRIMARY KEY,
                    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
                    type_id TEXT,
                    position INTEGER NOT NULL DEFAULT 0,
                    data TEXT NOT NULL DEFAULT '{}'
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "reader state and annotations (local-only, never exported)",
            sql: "
                CREATE TABLE IF NOT EXISTS reader_state (
                    card_id TEXT NOT NULL,
                    slot_id TEXT NOT NULL,
                    data TEXT NOT NULL DEFAULT '{}',
                    PRIMARY KEY (card_id, slot_id)
                );
                CREATE TABLE IF NOT EXISTS annotations (
                    id TEXT PRIMARY KEY,
                    card_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    body TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "card types (Factory/gallery layer)",
            sql: "
                CREATE TABLE IF NOT EXISTS card_types (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    data TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "app preferences",
            sql: "
                CREATE TABLE IF NOT EXISTS preferences (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "extensible data blobs on notebooks and sections",
            sql: "
                ALTER TABLE notebooks ADD COLUMN data TEXT NOT NULL DEFAULT '{}';
                ALTER TABLE sections ADD COLUMN data TEXT NOT NULL DEFAULT '{}';
            ",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:notebuilder.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![print_page, exit_app])
        .setup(|app| {
            let import = MenuItemBuilder::with_id("import_json", "Import Notebook JSON…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let export = MenuItemBuilder::with_id("export_json", "Export Notebook JSON…")
                .accelerator("CmdOrCtrl+Shift+E")
                .build(app)?;
            let export_html = MenuItemBuilder::with_id("export_html", "Share as HTML…")
                .accelerator("CmdOrCtrl+Shift+P")
                .build(app)?;

            let menu = Menu::default(app.handle())?;
            let mut appended = false;
            for item in menu.items()? {
                if let MenuItemKind::Submenu(sub) = item {
                    if sub.text()? == "File" {
                        sub.append(&PredefinedMenuItem::separator(app)?)?;
                        sub.append(&import)?;
                        sub.append(&export)?;
                        sub.append(&export_html)?;
                        appended = true;
                        break;
                    }
                }
            }
            if !appended {
                let file = SubmenuBuilder::new(app, "File")
                    .item(&import)
                    .item(&export)
                    .item(&export_html)
                    .build()?;
                menu.append(&file)?;
            }
            // The predefined Quit item (Cmd+Q on macOS, File > Exit on Windows) ends the event
            // loop directly (terminate: / PostQuitMessage) without an ExitRequested event, which
            // would skip the save flush. Swap it for our own item that goes through request_quit.
            for item in menu.items()? {
                if let MenuItemKind::Submenu(sub) = item {
                    for (pos, child) in sub.items()?.into_iter().enumerate() {
                        if let MenuItemKind::Predefined(predefined) = &child {
                            let label = predefined.text()?;
                            if is_quit_label(&label) {
                                let quit = MenuItemBuilder::with_id("app_quit", label)
                                    .accelerator("CmdOrCtrl+Q")
                                    .build(app)?;
                                sub.remove(predefined)?;
                                sub.insert(&quit, pos)?;
                            }
                        }
                    }
                }
            }
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "import_json" => {
                    let _ = app.emit("menu://import-json", ());
                }
                "export_json" => {
                    let _ = app.emit("menu://export-json", ());
                }
                "export_html" => {
                    let _ = app.emit("menu://export-html", ());
                }
                "app_quit" => request_quit(app),
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // A user-initiated exit while a window is still open: hold it and flush first
            // (request_quit). Closing the last window is handled by the window's own
            // close-requested flush; by then no window remains, so that exit is not held.
            // Programmatic exits (code: Some — exit_app, the fallback) always go through.
            if let RunEvent::ExitRequested {
                code: None, api, ..
            } = &event
            {
                if !app.webview_windows().is_empty() {
                    api.prevent_exit();
                    request_quit(app);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::is_quit_label;

    #[test]
    fn recognizes_the_predefined_quit_labels() {
        assert!(is_quit_label("Quit notebuilder")); // macOS app menu
        assert!(is_quit_label("&Quit")); // Linux
        assert!(is_quit_label("&Exit")); // Windows
        assert!(!is_quit_label("Quiet mode"));
        assert!(!is_quit_label("Export Notebook JSON…"));
        assert!(!is_quit_label("C&lose Window"));
    }
}
