use tauri::menu::{Menu, MenuItemBuilder, MenuItemKind, PredefinedMenuItem, SubmenuBuilder};
use tauri::Emitter;
use tauri_plugin_sql::{Migration, MigrationKind};

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
        .setup(|app| {
            let import = MenuItemBuilder::with_id("import_json", "Import Notebook JSON…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let export = MenuItemBuilder::with_id("export_json", "Export Notebook JSON…")
                .accelerator("CmdOrCtrl+Shift+E")
                .build(app)?;

            let menu = Menu::default(app.handle())?;
            let mut appended = false;
            for item in menu.items()? {
                if let MenuItemKind::Submenu(sub) = item {
                    if sub.text()? == "File" {
                        sub.append(&PredefinedMenuItem::separator(app)?)?;
                        sub.append(&import)?;
                        sub.append(&export)?;
                        appended = true;
                        break;
                    }
                }
            }
            if !appended {
                let file = SubmenuBuilder::new(app, "File")
                    .item(&import)
                    .item(&export)
                    .build()?;
                menu.append(&file)?;
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
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
