# GitHub Manager PRO for Acode

A custom GitHub workspace plugin for Acode Android editor.

## Included
- GitHub OAuth Device Flow (requires your own OAuth App Client ID and Device Flow enabled)
- Personal Access Token fallback
- Repository list and create repository
- Browse repository contents and branches
- Create branch from current branch
- Create/upload text files, edit files, delete files with confirmation
- Upload multiple local text files
- Download repository ZIP through GitHub archive URL
- Manual sync/pull refresh and selected-file upload
- Create/list/delete Gists
- Create/list/delete Releases
- List GitHub Actions runs, open a run, and request re-run

## Install
1. Download `GitHub-Manager-PRO.zip` to your Android device.
2. Open Acode → Settings → Plugins (or Extensions sidebar).
3. Tap `+` → `LOCAL`, then select the ZIP.
4. Reload Acode if requested. Tap the GitHub side button.
5. Configure OAuth as described below.

## Configure OAuth Device Flow
1. Open https://github.com/settings/developers
2. Create a new OAuth App.
3. In the OAuth App settings, enable **Device Flow**.
4. Copy the **Client ID**.
5. In GitHub Manager PRO, enter the Client ID and tap **Login with GitHub**.
6. Visit https://github.com/login/device, enter the one-time code, and authorize.
7. Return to Acode. The plugin polls GitHub and saves the token using Acode's encrypted Plugin Context storage.

The Client ID is public. Never put an OAuth Client Secret in this plugin. OAuth Device Flow requires a registered OAuth App; the ZIP cannot create or register an app on your behalf.

## Token permissions
The OAuth flow requests `repo`, `gist`, and `read:user`. GitHub may show the exact permissions during authorization. For fine-grained PAT use, grant the minimum required repository permissions (Contents: read/write; Metadata: read; Actions: read/write if rerun is needed; Releases are managed through repository contents/metadata) and Gists access.

## Notes / limitations
- GitHub API limits and repository branch protections apply.
- Each file upload/edit/delete creates an individual Git commit; this is not a native multi-file atomic Git commit.
- Upload currently handles text files selected from the Android file picker. Binary upload is not supported by the text editor upload workflow.
- ZIP download opens GitHub's archive URL in the browser; private repository download depends on browser authentication.
- "Sync" is a safe manual workflow: refresh remote listing and upload selected local files. It does not silently scan or overwrite an entire Acode workspace.
- GitHub Actions rerun requires sufficient repository access.
- OAuth Device Flow browser/network behavior can vary by Acode WebView and Android version. If OAuth exchange is blocked, use PAT fallback.
- Plugin code runs with Acode's plugin privileges. Install only if you trust the source.

## Source
- Acode plugin docs: https://docs.acode.app/docs/getting-started/create-plugin
- GitHub REST API: https://docs.github.com/en/rest
