# vaishakbalachandra.github.io

Personal academic website of **Vaishak Balachandra**: research on estimating hidden states and hidden regimes from noisy financial data, and on decisions under model uncertainty.

Live at **https://vaishakbalachandra.github.io**

## What is here

| Path | Purpose |
|---|---|
| `index.html` | The whole site, one page |
| `assets/css/site.css` | Design tokens, light and dark themes, layout |
| `assets/js/figure.js` | The hero figure: an adaptive Kalman filter tracking a hidden state through a regime change (seeded, so it is the same for every visitor) |
| `assets/js/site.js` | Theme toggle, mobile menu, scroll reveal, email links |
| `assets/fonts/` | Self-hosted Inter and Newsreader (SIL Open Font License) |
| `cv/Vaishak_Balachandra_CV.pdf` | Current CV, and its LaTeX source |

No framework and no build step: GitHub Pages serves the files as they are. To change something, edit the file on GitHub and commit; the site updates in about a minute.

To update the CV, upload the new PDF to `cv/` under the same file name, `Vaishak_Balachandra_CV.pdf`, so every link to it keeps working. Then change "Last updated" in the footer of `index.html`.
