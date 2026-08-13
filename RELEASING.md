# Releasing

One version at a time, in this order.

1. **Update `CHANGELOG.md`** and the version in `package.json` and
   `src/version.ts`. Several fixes waiting to ship are packed into one version
   and one changelog entry.
2. **`npm run typecheck && npm test && npm run build`**, and five identical test
   runs.
3. **Publish to npm.** By hand for the first release of a name that does not
   exist yet, since trusted publishing cannot be configured on an unknown name.
   By workflow afterwards, under the repository's OIDC identity.
4. **Tag**, which builds the `.mcpb` bundle and cuts the GitHub release.
   A release cut by a workflow starts no other workflow, so the npm publish and
   the registry entry are dispatched by hand afterwards:
   `gh workflow run publish.yml` and `gh workflow run registry.yml -f tag=vX.Y.Z`. The registry caps its description at 100 characters and
   checks that the bundle URL downloads, so that URL is computed at publish time
   and never written by hand.
5. **Glama.** Claim the server, set the build spec, then `Build` alone followed
   by `Make Release` with the real number.
6. **Third-party directories.**

Verify the one-click install links before announcing: they encode the package
name, and a copy carries whatever name it was copied from.
