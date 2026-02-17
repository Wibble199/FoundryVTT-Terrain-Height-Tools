# Release Process

This document describes how to trigger a build and release for the Terrain Height Tools module.

## Prerequisites

Before creating a release, ensure:

1. All changes are committed and pushed to the main branch
2. Tests pass (`npm test`)

## How to Trigger a Release

The release process is automated via GitHub Actions and is triggered by creating and pushing a git tag. The version in `module.json` will be automatically updated to match the tag during the release process.

### Step 1: Create and Push a Git Tag

Create a git tag with your desired version number:

```bash
# Create the tag
git tag 0.5.12

# Push the tag to GitHub
git push origin 0.5.12
```

**Important:** The tag name should be a valid version number (e.g., "0.5.12", not "v0.5.12").

### Step 2: Monitor the Release Workflow

Once you push the tag, the GitHub Actions workflow will automatically:

1. Check out the code
2. Update the version in `module.json` to match the tag
3. Update the download URL in `module.json` to point to the new release
4. Create a zip file containing all module files
5. Create a draft GitHub release with the tag
6. Upload `module.json` and `release.zip` to the release
7. Optionally publish to the Foundry Package Registry (if not a beta release)

You can monitor the progress at:
https://github.com/Shteb/FoundryVTT-Terrain-Height-Tools-Wall-Half-Baked-V13/actions

### Step 3: Publish the Release

After the workflow completes:

1. Go to https://github.com/Shteb/FoundryVTT-Terrain-Height-Tools-Wall-Half-Baked-V13/releases
2. Find your draft release
3. Edit the release notes if needed
4. Click "Publish release"

## Beta Releases

To create a beta release that won't be published to the Foundry Package Registry, include "beta" in the tag name:

```bash
git tag 0.5.12-beta.1
git push origin 0.5.12-beta.1
```

Beta releases will create a draft GitHub release but will skip the Foundry Package Registry publication step.

## Troubleshooting

### Workflow Fails

If the workflow fails, check the Actions tab for error logs:
https://github.com/Shteb/FoundryVTT-Terrain-Height-Tools-Wall-Half-Baked-V13/actions

Common issues:
- Missing files in the zip command
- Incorrect version format in `module.json`
- Missing `FOUNDRY_AUTH_TOKEN` secret (required for Foundry Package Registry publication)

### Deleting a Tag

If you need to delete a tag (e.g., due to a mistake):

```bash
# Delete the tag locally
git tag -d 0.5.12

# Delete the tag on GitHub
git push origin :refs/tags/0.5.12
```

**Note:** With the automatic version population, you no longer need to manually update `module.json` before creating a tag. The workflow handles this automatically.

### Re-creating a Release

If you need to re-create a release:

1. Delete the GitHub release (if it was published)
2. Delete the tag (see above)
3. Fix any issues
4. Create and push the tag again

## What Gets Included in the Release

The following files and directories are included in `release.zip`:

- `lang/` - Language files
- `module/` - Module source code
- `presets/` - Terrain type presets
- `styles/` - CSS files
- `templates/` - Handlebars templates
- `textures/` - Image assets
- `license.md` - License file
- `module.json` - Module manifest (with updated download URL)
- `README.md` - Documentation

The following are **NOT** included:
- `.git/` - Git metadata
- `.github/` - GitHub Actions workflows
- `test/` - Unit tests
- `node_modules/` - Dependencies
- Development files (`package.json`, `jsconfig.json`, etc.)
