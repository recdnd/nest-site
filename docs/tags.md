# Tags 管理說明

## 在哪裡管理？

每個圖集的 **tags** 都在對應的 **pack manifest** 裡：

- 路徑：`packs/<圖集 id>/manifest.json`
- 圖集 id 與根目錄資料夾對應：`2024-2025`、`2023`、`2022`、`eden`

## 怎麼人工修改／添加？

1. 用編輯器打開該圖集的 `packs/<id>/manifest.json`。
2. 在 `items` 陣列裡找到要改的那一筆（依 `file` 檔名對應）。
3. 修改該項的 `tags` 陣列：
   - **格式：manifest 只存內容，不寫 `#`**，例如：`"tags": ["Rockman", "Meagan", "Roll"]`
   - 畫面上顯示時會自動加上 `#`。
4. 可加、可刪、可改，存檔即可。前端會在全屏時左上角顯示這些 tags（帶 `#`，以空格分隔）。

範例（為某張圖加上 tag）：

```json
{
  "file": "20250429__roll__signed__final__out.png",
  "title": null,
  "tags": ["Rockman", "Meagan", "Roll"],
  "set": null
}
```

- `title`：選填，有值時會在全屏顯示在 tags 上方。
- `set`：選填，若 manifest 裡有 `sets`，可填 set id 以繼承該 set 的 title/tags。

修改後重新整理頁面即可看到效果，無需跑 deploy。
