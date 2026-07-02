# 日记云同步 Worker

这个目录用于部署私有同步接口。GitHub Pages 仍然只放前端页面，真实日记数据会先在浏览器端加密，再写入 Cloudflare KV。

## 部署步骤

1. 登录 Cloudflare：

```bash
npx wrangler login
```

2. 创建 KV：

```bash
npx wrangler kv namespace create RIZHI_STORE
```

3. 把命令返回的 `id` 填入 `wrangler.toml` 的 `REPLACE_WITH_KV_NAMESPACE_ID`。

4. 设置同步密钥：

```bash
npx wrangler secret put SYNC_TOKEN
```

5. 部署：

```bash
npx wrangler deploy
```

6. 在日记系统“备份 -> 云同步”里填写：

```text
同步接口地址：https://你的-worker.workers.dev
同步密钥：第 4 步设置的 SYNC_TOKEN
端到端加密钥匙：留空自动生成
```

手机端也可以第一次直接打开：

```text
https://tangwenzhenyx-maker.github.io/rizhi/#syncApi=https%3A%2F%2F你的-worker.workers.dev&syncToken=你的同步密钥&syncKey=你的端到端加密钥匙
```

`#` 后面的内容不会发送给 GitHub Pages。打开后同步密钥和端到端加密钥匙会被自动保存到手机浏览器，并从地址栏移除。Cloudflare 只保存密文，不保存加密钥匙。
