# Automation state after phases 0-3

The runtime source, tests, QA assets and local build configuration were imported from the frozen PDVNexus snapshot.

Release automation is intentionally not inherited as active automation in phases 0-3. `publish-pdv-release.yml` is a disabled compatibility stub so the upgrade/release contract test can still verify the overwrite guard text while no GitHub Release or Google Drive publication can occur.

Build/release CI for PDV Nexus Clássico Azul must be recreated with the isolated artifact names and its own distribution channel in Phase 8. Until then, validation is local/CI test-and-build only and the product updater metadata remains disabled.
