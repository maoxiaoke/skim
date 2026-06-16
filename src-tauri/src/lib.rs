mod commands;
mod error;
mod safety;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::read::read_text_files,
            commands::read::scan_skill_dirs,
            commands::read::list_dir_names,
            commands::read::read_codex_config,
            commands::read::decode_project_dirs,
            commands::read::dirs_exist,
            commands::read::list_archive,
            commands::read::read_claude_installed_plugins,
            commands::write::apply_codex_toml_patch,
            commands::write::apply_codex_plugin_patch,
            commands::write::write_skim_config,
            commands::write::write_claude_settings,
            commands::write::archive_move,
            commands::write::trash_path,
            commands::write::restore_move,
        ])
        .run(tauri::generate_context!())
        .expect("error while running skim");
}
