# vaishakbalachandra.github.io

Personal academic website of **Vaishak Balachandra**: research on estimating hidden states and hidden regimes from noisy financial data, and on decisions under model uncertainty.

Live at **https://vaishakbalachandra.github.io**

## Figure 1

The chart at the top of the page is a small simulation that runs in the browser (`js/figure.js`):

- A hidden quantity mean-reverts around the level of its current regime, and only noisy observations of it are shown.
- The white line and band are a local-level Kalman filter that inflates its process noise when its own forecast errors run larger than expected, so it re-learns after a change.
- **Shift the regime** changes the level and volatility without warning. A two-sided CUSUM detector on standardized forecast errors flags the change; flagging sooner means more false alarms.
- **Compare a standard filter** adds the same filter without the adaptation.
- The first 200 observations come from a fixed seed, so every visitor sees the same opening.

## What is here

| Path | Purpose |
|---|---|
| `index.html` | The whole site, one page |
| `css/site.css` | Colors, type, layout, light and dark themes |
| `js/figure.js` | Figure 1 |
| `js/site.js` | Theme switch, mobile menu, navigation, email links |
| `fonts/` | Self-hosted Source Serif 4 and IBM Plex Sans (SIL Open Font License) |
| `img/` | Portrait, link-preview card and phone home-screen icon |
| `assets/favicon.svg` | Browser-tab icon |
| `cv/` | Current CV (PDF) and its LaTeX source |

No framework and no build step: GitHub Pages serves the files as they are. To change something, edit the file on GitHub and commit; the site updates in about a minute.

To update the CV, upload the new PDF to `cv/` under the same file name, `Vaishak_Balachandra_CV.pdf`, so every link to it keeps working. Then change "Last updated" in the footer of `index.html`.
