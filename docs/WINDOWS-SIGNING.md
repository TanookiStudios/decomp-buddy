# Signing the Windows build

Unsigned, Windows shows "Windows protected your PC" and people have to click More info → Run anyway.
Signing with **Azure Artifact Signing** (formerly Trusted Signing) fixes that over time.

## What it takes (Maddie)
1. An Azure account for Tanooki Studios LLC, with a card on it. Basic plan: about **$9.99/month**
   (5,000 signatures; Decomp Buddy uses a handful per release).
2. In the Azure portal: create an **Artifact Signing account**, then a **Public Trust identity validation**
   for the LLC (legal name, EIN, D-U-N-S, address). Microsoft says it can take from minutes to a week.
3. Create a **certificate profile** (Public Trust) once the validation passes.
4. Create an **app registration** (Entra ID) with the "Artifact Signing Certificate Profile Signer" role
   on the signing account; note its tenant id, client id and a client secret.

## Then (Claude)
- Put those six values in GitHub → repository secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
  `AZURE_CLIENT_SECRET`, `AZURE_SIGN_ENDPOINT` (e.g. `https://eus.codesigning.azure.net`),
  `AZURE_SIGN_ACCOUNT`, `AZURE_SIGN_PROFILE`.
- Run **Actions → Windows (signed)**; it builds, signs, checks every .exe's signature and uploads them.
- Or on a Windows PC with the same values as environment variables, `scripts/release.sh` signs automatically.

## Honest expectations
- SmartScreen goes by reputation: a brand-new signature can still warn for the first few weeks /
  first few hundred installs. It stops after that, and it stops for good.
- Signing needs Windows' signtool, so it can't happen on the Mac - hence the GitHub Actions job.
  GitHub charges Actions minutes on private repositories (Windows minutes count double); one build is a
  few minutes.
