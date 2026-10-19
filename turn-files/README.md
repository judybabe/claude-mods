# turn-files

`/turn-files` 開一個面板，列出 Claude 這一輪寫入的檔案；再打一次收合。

安裝（Claude Code 2.1.275 以上，一步完成）：

```
/plugin install turn-files --marketplace judybabe/claude-mods
```

- 每個檔案可以點開，看 unified diff、Claude 為什麼改它、以及一句改了什麼的摘要。
- 同一輪改同一個檔案兩次會合併成一筆。
- 路徑先相對於專案資料夾顯示，不在專案內的相對於 home。
- 這一輪沒改任何檔案時，面板保留上一輪的清單。
- 摘要失敗時提供重試。

usage-band 的「檔案」切換鈕就是在呼叫這個指令。
