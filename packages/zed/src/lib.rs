//! Starts the Lit language server for Zed.
//!
//! The server is found, in order: the path in the `lsp.lit-language-server`
//! settings; the project's own install of `@oddsquad/lit-language-server`, so
//! its version matches the project; the package's source in the
//! vite-plugin-lit repo itself; else the latest release, installed from npm
//! into the extension's folder. A JavaScript server runs with Zed's Node.

use zed_extension_api::{self as zed, settings::LspSettings, LanguageServerId, Result};

const SERVER_ID: &str = "lit-language-server";
const PACKAGE: &str = "@oddsquad/lit-language-server";
const BIN: &str = "dist/bin.mjs";

struct LitExtension {
    /// The npm install checked this session, so it's looked up once.
    installed: Option<String>,
}

impl LitExtension {
    /// The server's path inside the project, when the project has one.
    fn project_server(worktree: &zed::Worktree) -> Option<String> {
        let root = worktree.root_path();
        let candidates = [
            format!("node_modules/{PACKAGE}"),
            // This repo: the workspace package, built by `vp pack`.
            "packages/lit-language-server".to_string(),
        ];
        candidates.into_iter().find_map(|dir| {
            let manifest = worktree.read_text_file(&format!("{dir}/package.json")).ok()?;
            manifest
                .contains(&format!("\"name\": \"{PACKAGE}\""))
                .then(|| format!("{root}/{dir}/{BIN}"))
        })
    }

    /// The latest release from npm, installed into the extension's folder.
    fn npm_server(&mut self, id: &LanguageServerId) -> Result<String> {
        if let Some(path) = &self.installed {
            return Ok(path.clone());
        }
        zed::set_language_server_installation_status(
            id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );
        let latest = zed::npm_package_latest_version(PACKAGE).map_err(|error| {
            format!(
                "{PACKAGE} isn't installed in this project and couldn't be fetched from npm \
                 ({error}). Set lsp.{SERVER_ID}.binary.path in Zed's settings to its dist/bin.mjs."
            )
        })?;
        if zed::npm_package_installed_version(PACKAGE)?.as_deref() != Some(latest.as_str()) {
            zed::set_language_server_installation_status(
                id,
                &zed::LanguageServerInstallationStatus::Downloading,
            );
            zed::npm_install_package(PACKAGE, &latest)?;
        }
        let dir = std::env::current_dir().map_err(|error| error.to_string())?;
        let path = dir
            .join("node_modules")
            .join(PACKAGE)
            .join(BIN)
            .to_string_lossy()
            .into_owned();
        self.installed = Some(path.clone());
        Ok(path)
    }
}

/// Runs a JavaScript server with Zed's Node; anything else directly.
fn command_for(path: String, mut args: Vec<String>) -> Result<zed::Command> {
    if !args.iter().any(|arg| arg == "--stdio") {
        args.push("--stdio".to_string());
    }
    let is_script = [".js", ".mjs", ".cjs"].iter().any(|ext| path.ends_with(ext));
    if !is_script {
        return Ok(zed::Command { command: path, args, env: Vec::new() });
    }
    let mut node_args = vec![path];
    node_args.extend(args);
    Ok(zed::Command {
        command: zed::node_binary_path()?,
        args: node_args,
        env: Vec::new(),
    })
}

impl zed::Extension for LitExtension {
    fn new() -> Self {
        LitExtension { installed: None }
    }

    fn language_server_command(
        &mut self,
        id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let binary = LspSettings::for_worktree(SERVER_ID, worktree)
            .ok()
            .and_then(|settings| settings.binary);
        let args = binary
            .as_ref()
            .and_then(|binary| binary.arguments.clone())
            .unwrap_or_default();
        if let Some(path) = binary.and_then(|binary| binary.path) {
            return command_for(path, args);
        }
        let path = match Self::project_server(worktree) {
            Some(path) => path,
            None => self.npm_server(id)?,
        };
        command_for(path, args)
    }
}

zed::register_extension!(LitExtension);
