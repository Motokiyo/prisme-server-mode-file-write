# Distribution Prisme Desktop

Ce document décrit le flux cible pour livrer Prisme Desktop sur macOS, Windows et Linux avec Electron.

## Lancer l'app en développement

Depuis un nouveau terminal :

```bash
prismeapp
```

La fonction `prismeapp` lance maintenant le desktop Electron :

```bash
cd ~/Documents/CODE/prismeworkspace
OPENCODE_CHANNEL=dev bun dev:desktop
```

Si le terminal était déjà ouvert avant la modification de `~/.zshrc`, recharger la config :

```bash
source ~/.zshrc
```

## Builds locaux

Installer les dépendances à la racine :

```bash
bun install
```

Build renderer/main Electron :

```bash
cd packages/desktop
OPENCODE_CHANNEL=prod bun run build
```

Package macOS depuis macOS :

```bash
OPENCODE_CHANNEL=prod bun run package:mac
```

Package Windows depuis Windows :

```bash
OPENCODE_CHANNEL=prod bun run package:win
```

Package Linux depuis Linux :

```bash
OPENCODE_CHANNEL=prod bun run package:linux
```

Les sorties sont dans :

```text
packages/desktop/dist/
```

## Donner un DMG à un ami

Pour un test rapide, envoyer le `.dmg` généré :

```text
packages/desktop/dist/prisme-desktop-mac-arm64.dmg
```

Tant que l'app n'est pas signée et notarizée Apple, macOS peut afficher un blocage Gatekeeper. Pour une vraie distribution publique, il faut configurer les étapes de signature ci-dessous.

Un DMG prêt à partager doit passer :

```bash
spctl -a -vvv -t install packages/desktop/dist/prisme-desktop-mac-arm64.dmg
```

Le résultat attendu contient :

```text
accepted
source=Notarized Developer ID
```

## Signature et confiance

macOS :

- Compte Apple Developer Program.
- Certificat `Developer ID Application`.
- Notarization via App Store Connect API key.
- Secrets GitHub recommandés :
  - `APPLE_CERTIFICATE` : certificat `.p12` encodé en base64.
  - `APPLE_CERTIFICATE_PASSWORD` : mot de passe du `.p12`.
  - `APPLE_API_KEY_BASE64` : fichier `.p8` App Store Connect encodé en base64.
  - `APPLE_API_KEY_ID` : key id App Store Connect.
  - `APPLE_API_ISSUER` : issuer id App Store Connect.

Windows :

- Certificat de signature Windows ou Azure Trusted Signing.
- Secrets GitHub recommandés si Azure Trusted Signing :
  - `AZURE_CLIENT_ID`
  - `AZURE_TENANT_ID`
  - `AZURE_SUBSCRIPTION_ID`
  - `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
  - `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE`
  - `AZURE_TRUSTED_SIGNING_ENDPOINT`

Azure Trusted Signing s'appelle maintenant Azure Artifact Signing dans les docs Microsoft. C'est l'option recommandée pour distribuer une app Windows hors Microsoft Store.

Flux recommandé :

1. Créer un compte Azure.
2. Créer une ressource `Artifact Signing Account`.
3. Faire l'identity validation Microsoft.
4. Créer un certificate profile `Public Trust`.
5. Créer une App Registration Microsoft Entra pour GitHub Actions.
6. Ajouter une federated credential GitHub Actions sur le repo Prisme.
7. Donner à cette App Registration le rôle `Trusted Signing Certificate Profile Signer` sur le certificate profile.
8. Ajouter les secrets GitHub listés ci-dessus.

La release Windows est validée par `Get-AuthenticodeSignature` dans le workflow.

Linux :

- AppImage, `.deb` et `.rpm` peuvent être distribués sans signature obligatoire.
- Pour une distribution plus propre plus tard : depot apt/rpm, signature GPG, ou publication via stores.

## Auto-update

Prisme utilise `electron-updater`.

Configuration actuelle :

- provider GitHub : `EliottMeunierFluid/prismeworkspace`
- canal stable : `latest`
- canal beta : `beta`
- updater actif seulement pour les builds packagés `beta` ou `prod`
- updater désactivé pour `dev`

Pour publier une update :

1. Incrémenter la version dans `packages/desktop/package.json`.
2. Builder et packager avec `OPENCODE_CHANNEL=prod`.
3. Publier les artefacts sur une GitHub Release taggée `vX.Y.Z`.
4. Inclure les fichiers update metadata générés par Electron Builder (`latest*.yml`, ou `beta*.yml` pour beta).
5. Les apps déjà installées pourront détecter la nouvelle release via le menu update existant.

Pour publier automatiquement, utiliser le workflow GitHub `prisme desktop release`.

Le workflow notarize aussi le conteneur `.dmg`, pas seulement le `.app` interne. Pour les updates macOS, le fichier important est le `.zip` référencé dans `latest-mac.yml`; le `.dmg` est destiné au téléchargement manuel.

## Checklist release stable

Avant d'envoyer à des utilisateurs hors test :

- `bun install`
- `bun turbo typecheck`
- `cd packages/app && bun test --preload ./happydom.ts ./src`
- `cd packages/desktop && OPENCODE_CHANNEL=prod bun run build`
- builds macOS, Windows et Linux générés par GitHub Actions
- macOS signé et notarizé
- Windows signé
- GitHub Release publique avec tous les assets
- installation testée sur une machine propre
- update testée depuis une version précédente

## Notes importantes

- Garder le repo upstream-first : ne pas supprimer les packages OpenCode officiels.
- Garder les changements Prisme dans des composants dédiés ou de petites intégrations.
- Ne pas publier depuis les canaux OpenCode officiels.
- Ne pas utiliser `OPENCODE_CHANNEL=dev` pour une release envoyée à un ami si on veut tester les updates.
