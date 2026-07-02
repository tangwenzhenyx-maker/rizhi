# 日记档案馆 PWA

这是一个可以在手机 Safari 打开、添加到主屏幕的个人日记网页 App。

## 本地启动

双击：

```text
启动日记系统.command
```

或在当前目录运行：

```bash
python3 server.py --host 0.0.0.0 --port 8782
```

然后打开：

```text
http://127.0.0.1:8782/
```

## 手机测试

如果以前已经开着旧的启动窗口，请先关闭旧窗口，再双击 `启动日记系统.command`。保持同一个端口，PC 端已有日记才能自动迁移到共享数据。

双击 `启动日记系统.command` 后，启动窗口会显示两行地址：

```text
Computer: http://127.0.0.1:8782/
Phone on the same Wi-Fi: http://你的电脑局域网IP:8782/
```

手机和电脑连同一个 Wi-Fi 后，用手机 Safari 打开第二个地址。

如果手机仍然显示“建立你的私人日记档案馆”，说明手机缓存了旧数据。可以在手机 Safari 打开：

```text
http://你的电脑局域网IP:8782/?fresh=20260702&reset-mobile=1
```

## 添加到 iPhone 主屏幕

部署到 GitHub Pages 后，用 iPhone Safari 打开固定网址，点分享按钮，选择“添加到主屏幕”。

## 公开部署说明

GitHub Pages 只发布程序文件，不发布 `data/` 目录里的真实日记、QQ 导入数据、共享存储和备份。公网版本不会自动带出本机日记数据，因此首次打开会显示为一个空系统。

## 公网云同步

如果要让手机在公网固定地址上看到同一份日记，需要再部署一个私有同步接口。项目已提供 Cloudflare Worker 版本：

```text
cloudflare-worker/
```

部署后，Cloudflare Worker/KV 是 PC 和手机共用的主数据源。手机端直接连接 Worker；PC 端通过本机 `server.py` 代理连接同一个 Worker。本机 `data/shared-storage.json` 只作为缓存和备份，不再作为独立主库。

云同步使用两把钥匙：同步密钥用于防止别人调用接口；端到端加密钥匙用于在浏览器里加密日记正文。Cloudflare KV 只保存密文。

PC 端使用 `启动日记系统.command` 打开本机地址；手机端使用 GitHub Pages PWA。两端最终读写同一个 Cloudflare 数据源。

同步方式：

- 任一端保存日记后，会自动写入 Cloudflare 主数据源。
- 另一端点击顶部“同步刷新”，会从 Cloudflare 拉取最新数据并刷新列表。
- 页面从后台回到前台时，也会自动尝试同步刷新一次。
- 5 分钟无操作会自动锁定；但在 5 分钟活跃窗口内刷新页面，不会要求重新输入密码。

## 当前能力

- 支持手机 Safari 全屏网页 App 体验。
- 支持主屏幕图标。
- 支持基础离线打开。
- 通过 `启动日记系统.command` 启动时，PC 和同一 Wi-Fi 下的手机会读写同一份本地数据。
- 共享数据会保存在本目录 `data/shared-storage.json`，请继续定期在系统内做备份。
