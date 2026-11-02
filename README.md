# Seclusa Weather

A weather app you can add to your phone or computer like any other app.

Type in a town and it shows you what's happening there today and hour by hour.

## Features

- Version 0.7.8
- Today's weather, plus an hour-by-hour outlook
- Search for any town by name, or let it use your location if you'd rather not
  type
- It only asks for your location when you say yes. Say no and searching by name
  still works
- Add it to your home screen and it opens like a normal app, with no browser
  bar in the way, and works with no signal
- Remembers the last town you looked up, on your device only, for up to 3 days.
  A "Remember" switch in settings turns this off and clears it. Clearing your
  browser data removes it too
- No sign-up, no adverts, and nothing that follows you around

## Usage

Open it and type in a town name.

To add it to your home screen, open your browser's menu and choose "Add to Home
Screen".

## Security

HTTP Observatory grades server header knobs; on GitHub Pages this app scores about **B**, because Pages cannot send `X-Frame-Options` (−20) or `X-Content-Type-Options` (−5). For a static same-origin PWA with no accounts, cookies, or privileged actions, that is acceptable — real protection is the tight meta CSP (no unsafe inline/eval, local-only data), not those missing server headers. See [Scan results - HTTP Observatory _ MDN.pdf](Scan%20results%20-%20HTTP%20Observatory%20_%20MDN.pdf).

## License

GPL-3.0. See [LICENSE](LICENSE).
