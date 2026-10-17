# Editor screenshots

`index.html` loads the action group editor webview (`out/webview/actionGroupEditor.js`
and `media/actionGroupEditor.css`) in a normal browser. VS Code is replaced by a small
fake that answers with sample data from `test_workspaces/workspace10`, and the theme
variables approximate VS Code's Dark Modern and Light Modern themes.

`scenario.js` clicks through the editor for a screenshot, selected with
`?scenario=edit|new|saved|invalid`. `?section=debugSession` (or another section) scrolls
the form, and `?theme=light` switches the theme.

To update the README screenshot in `images/docs/`:

```bash
npm run compile
scripts/editor-screenshots/take-screenshots.sh
```

This needs Google Chrome (set `CHROME` to use another Chromium based browser) and
Python 3 for the local web server. To look at a scenario yourself, serve the repository
root (`python3 -m http.server 8765`) and open
`http://127.0.0.1:8765/scripts/editor-screenshots/index.html?scenario=new`.
