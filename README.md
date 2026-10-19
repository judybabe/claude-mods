# judy-mods

Claude Code 的三個自製 mod（外掛）。每個 mod 都只動 Claude Code 自己的介面或行為，不碰你的專案程式碼。

| mod | 做什麼 |
|---|---|
| [usage-band](usage-band/) | 輸入框上方一條細帶：模型、context 用量、五小時與本週額度、prompt cache 倒數；context 超過 70% 出現「交接」按鈕 |
| [edit-guard](edit-guard/) | 記錄每個工作階段改過的檔案；另一個工作階段 30 分鐘內改過的檔案，動手前先問你 |
| [turn-files](turn-files/) | `/turn-files` 開一個面板，列出這一輪 Claude 改了哪些檔案，點開看 diff、原因與摘要 |

## 安裝

```
claude plugin marketplace add <GitHub 帳號>/claude-mods
claude plugin install usage-band@judy-mods
claude plugin install edit-guard@judy-mods
claude plugin install turn-files@judy-mods
```

裝完在 Claude Code 裡輸入 `/reload-plugins`，或重開。三個 mod 彼此獨立，只裝想要的也行；usage-band 的「檔案」切換鈕會呼叫 turn-files，沒裝的話那顆鈕只是不會有東西。

## 需求

- Claude Code 2.1.303 以上（mod 的 hook API 跟版本走，更舊的版本沒測過）。
- 不需要任何外部程式。

## 介面語言

所有提示文字與指令說明都是繁體中文。edit-guard 的詢問時間以台灣時區顯示。

## 開發

```
claude plugin test <mod 名稱>
```

每個 mod 的 `tests/` 用 Claude Code 內建的 mod 測試框架，不需另外安裝套件。改完原始碼後 `/reload-plugins` 即生效，不必重裝。

## 授權

MIT，見 [LICENSE](LICENSE)。
