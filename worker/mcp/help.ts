/** Connection page shown at GET /mcp in a browser (same layout as the menhly MCP page). */
export function helpPage(origin: string): string {
  const url = `${origin}/mcp`;
  const claudeLink = `https://claude.ai/settings/connectors?modal=add-custom-connector&mcpName=${encodeURIComponent("Sale & Buying Console")}&mcpServerUrl=${encodeURIComponent(url)}`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCP · Sale &amp; Buying Console</title>
<style>
body{margin:0;background:#fbfaf6;color:#1b1b19;font:17px/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:1240px;margin:0 auto;padding:34px 30px 60px}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:700;font-size:32px;margin:0 0 8px}
p{margin:4px 0}.muted{color:#6d6c66;font-size:15px}
code{background:#efe9dc;padding:.12em .42em;border-radius:5px;font:15px ui-monospace,SFMono-Regular,Menlo,monospace}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:30px;margin:28px 0 26px}
h2{font-size:19px;margin:0 0 12px;font-weight:600}
pre{background:#1a1a1a;color:#f2f0e9;padding:14px 16px;border-radius:9px;overflow-x:auto;font:15px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0}
.btn{display:inline-block;background:#b5361c;color:#fff;font-weight:700;padding:12px 20px;border-radius:9px;text-decoration:none;font-size:18px}
ol{padding-left:22px;margin:14px 0 0}ol li{margin-bottom:8px;font-size:16px}
hr{border:0;border-top:1px solid #e2ddd0;margin:6px 0 18px}
</style></head><body><main>
<h1>MCP</h1>
<p>Kết nối Claude / ChatGPT tới <code>${esc(url)}</code> · API key: <code>tên-đăng-nhập:mật-khẩu</code> của tài khoản trong app (ví dụ <code>user:password</code>).</p>
<p class="muted">Khóa được kiểm tra với tài khoản của app — Sale chỉ thấy PFI của mình, Buyer/Admin thấy tất cả; tài khoản Warehouse không dùng được MCP. Gửi qua <code>X-API-Key</code>, <code>Authorization: Bearer</code> hoặc <code>?key=</code>. Máy chủ không lưu tài liệu bạn gửi cho Claude — chỉ các dòng hàng bạn yêu cầu thêm vào PFI/PO.</p>
<div class="cols">
  <section><h2>Claude Code</h2><pre>claude mcp add --transport http sale-buying-console ${esc(url)} \\
  --header "X-API-Key: user:password"</pre></section>
  <section><h2>Claude.ai</h2><a class="btn" href="${esc(claudeLink)}" target="_blank" rel="noopener">Thêm vào Claude.ai ↗</a>
    <ol><li>Nút này mở hộp thoại “Add custom connector” với tên và URL đã điền sẵn. Hộp thoại không có ô header, nên sửa URL thành <code>${esc(url)}?key=tên:mật-khẩu</code> (khóa nằm trong URL).</li>
    <li>Giữ nguyên Authentication <b>Register automatically</b> và Transport <b>Streamable HTTP</b>; sẽ không có bước đăng nhập OAuth vì máy chủ nhận khóa trong URL.</li>
    <li>Bấm Add. Sau đó thả PDF vào chat: “đọc proforma này và thêm các dòng vào PFI 3200”. Trong app, tab <b>AI agent link</b> điền sẵn URL kèm khóa cho từng người.</li></ol></section>
  <section><h2>ChatGPT</h2><p>Settings → Apps &amp; Connectors → Advanced → Developer mode → Create → URL above (no header field — use <code>${esc(url)}?key=tên:mật-khẩu</code>), Authentication: No authentication.</p></section>
</div>
<hr>
<p class="muted">Tools: <code>list_customers</code> · <code>list_pfis</code> · <code>get_pfi</code> · <code>create_pfi</code> · <code>add_pfi_lines</code> · <code>list_pos</code> · <code>get_po</code> · <code>add_po_lines</code>. REST: <code>/api/state</code>, <code>/api/sync</code>, <code>/api/ai/parse-document</code>, <code>/api/files</code> (cookie đăng nhập).</p>
<p class="muted">Dòng hàng thêm qua MCP đi qua cùng bộ kiểm tra như Import PDF (bỏ dòng tổng, kiểm tra số kiểm tra mã vạch) và xuất hiện trong app trong vòng 20 giây; Buyer nhận thông báo “… via Claude”. Khóa admin dùng chung: đặt secret <code>MCP_API_KEY</code> trên Worker.</p>
</main></body></html>`;
}
