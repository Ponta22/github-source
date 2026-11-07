
/*
 * GitHub Manager PRO for Acode
 * Uses GitHub REST API + OAuth Device Flow (requires a GitHub OAuth App
 * with "Enable Device Flow" enabled). Token is stored using Acode ctx secret storage.
 */
(function () {
  "use strict";
  const PLUGIN_ID = "com.openai.acode.githubmanagerpro";
  const API = "https://api.github.com";
  const OAUTH = "https://github.com/login/device/code";
  const TOKEN = "https://github.com/login/oauth/access_token";
  const $ = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => {
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(c => el.append(c.nodeType ? c : document.createTextNode(String(c))));
    return el;
  };
  class GitHubManager {
    constructor() {
      this.ctx = null; this.token = ""; this.user = null; this.repo = null;
      this.branch = ""; this.path = ""; this.file = null; this.overlay = null;
      this.sideButton = null; this.deviceTimer = null;
    }
    async init(_baseUrl, _page, options) {
      this.ctx = options && options.ctx;
      if (this.ctx) this.token = await this.ctx.getSecret("github_access_token", "");
      try {
        const SideButton = window.acode && acode.require("sideButton");
        if (SideButton) {
          this.sideButton = SideButton({text:"GitHub", icon:"icon-github", backgroundColor:"#202a38", textColor:"#fff", onclick:()=>this.open()});
          this.sideButton.show();
        }
      } catch(e) { console.warn("GitHub Manager side button unavailable", e); }
      try {
        const commands = acode.require("commands");
        if (commands && commands.addCommand) {
          commands.addCommand({name:"GitHub Manager PRO", description:"Open GitHub Manager PRO", exec:()=>this.open()});
        }
      } catch(e) {}
    }
    async destroy() {
      if (this.deviceTimer) clearTimeout(this.deviceTimer);
      if (this.sideButton) this.sideButton.hide();
      if (this.overlay) this.overlay.remove();
    }
    notify(msg, type="info") {
      try { acode.pushNotification("GitHub Manager", msg, {type}); }
      catch(e) { console.log("[GitHub Manager]", msg); }
    }
    async request(path, options={}) {
      if (!this.token) throw new Error("Belum login ke GitHub.");
      const headers = Object.assign({
        "Accept":"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28",
        "Authorization":"Bearer "+this.token
      }, options.headers || {});
      const res = await fetch(API + path, Object.assign({}, options, {headers}));
      if (res.status === 204) return null;
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(body.message || `GitHub API error ${res.status}`);
      return body;
    }
    async loginDevice(clientId) {
      if (!clientId.trim()) throw new Error("Masukkan OAuth Client ID terlebih dahulu.");
      const start = await fetch(OAUTH, {
        method:"POST",
        headers:{"Accept":"application/json","Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({client_id:clientId.trim(), scope:"repo gist read:user"}).toString()
      });
      const data = await start.json();
      if (!start.ok || !data.device_code) throw new Error(data.error_description || data.error || "Gagal memulai OAuth Device Flow.");
      const code = data.user_code;
      const msg = `Buka https://github.com/login/device lalu masukkan kode:\n\n${code}\n\nSetelah menyetujui akses, kembali ke Acode.`;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).catch(()=>{});
      if (!confirm(msg)) return;
      const interval = Math.max(5, Number(data.interval || 5)) * 1000;
      const expiresAt = Date.now() + Number(data.expires_in || 900) * 1000;
      const poll = async () => {
        if (Date.now() > expiresAt) throw new Error("Kode OAuth kedaluwarsa. Coba login lagi.");
        const r = await fetch(TOKEN, {
          method:"POST",
          headers:{"Accept":"application/json","Content-Type":"application/x-www-form-urlencoded"},
          body:new URLSearchParams({client_id:clientId.trim(), device_code:data.device_code, grant_type:"urn:ietf:params:oauth:grant-type:device_code"}).toString()
        });
        const t = await r.json();
        if (t.access_token) {
          this.token = t.access_token;
          if (this.ctx) await this.ctx.setSecret("github_access_token", this.token);
          await this.loadUser(); this.render();
          this.notify("Login berhasil sebagai @"+this.user.login, "success");
          return;
        }
        if (t.error === "authorization_pending" || t.error === "slow_down") {
          this.deviceTimer = setTimeout(poll, interval + (t.error === "slow_down" ? 5000 : 0)); return;
        }
        throw new Error(t.error_description || t.error || "OAuth gagal.");
      };
      await poll();
    }
    async loadUser() { this.user = await this.request("/user"); }
    async logout() {
      this.token = ""; this.user = null;
      if (this.ctx) await this.ctx.deleteSecret("github_access_token");
      this.repo = null; this.render();
    }
    open() { this.render(); }
    mount() {
      if (this.overlay) this.overlay.remove();
      const css = `
      .ghm{position:fixed;inset:0;z-index:99999;background:#0d1117;color:#e6edf3;font:14px system-ui;display:flex;flex-direction:column}
      .ghm *{box-sizing:border-box}.ghm button,.ghm input,.ghm textarea,.ghm select{font:inherit}
      .ghm-head{padding:12px 14px;background:#161b22;border-bottom:1px solid #30363d;display:flex;gap:8px;align-items:center;justify-content:space-between}
      .ghm-title{font-weight:750;font-size:16px}.ghm-muted{color:#8b949e;font-size:12px}
      .ghm-main{padding:12px;overflow:auto;flex:1}.ghm-tabs{display:flex;gap:6px;overflow:auto;padding:9px;background:#161b22}
      .ghm button{border:1px solid #30363d;background:#21262d;color:#e6edf3;padding:8px 10px;border-radius:8px;cursor:pointer}
      .ghm button.primary{background:#238636;border-color:#238636}.ghm button.danger{background:#da3633;border-color:#da3633}
      .ghm button:disabled{opacity:.5}.ghm input,.ghm textarea,.ghm select{width:100%;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:8px;padding:9px;margin:5px 0 10px}
      .ghm textarea{min-height:220px;font-family:monospace;white-space:pre;tab-size:2}.ghm label{display:block;color:#8b949e;font-size:12px;margin-top:8px}
      .ghm-card{border:1px solid #30363d;border-radius:10px;padding:12px;margin:8px 0;background:#161b22}
      .ghm-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.ghm-row>*{flex:1}.ghm-item{padding:10px 2px;border-bottom:1px solid #30363d;display:flex;justify-content:space-between;gap:8px;align-items:center}
      .ghm-item strong{overflow-wrap:anywhere}.ghm-small{font-size:12px;color:#8b949e}.ghm-status{padding:8px;border-radius:8px;background:#1f2937;margin:8px 0;white-space:pre-wrap}
      .ghm-close{font-size:18px;padding:4px 10px!important}.ghm-footer{padding:9px 12px;border-top:1px solid #30363d;color:#8b949e;font-size:11px}
      `;
      const style = $("style",{text:css});
      this.overlay = $("div",{class:"ghm"});
      this.overlay.append(style);
      document.body.append(this.overlay);
    }
    async render(tab="home") {
      this.mount();
      const head = $("div",{class:"ghm-head"});
      head.append($("div",{},[$("div",{class:"ghm-title",text:"◉ GitHub Manager PRO"}),$("div",{class:"ghm-muted",text:this.user ? "@"+this.user.login : "Acode · GitHub REST API"})]));
      head.append($("button",{class:"ghm-close",text:"✕",onclick:()=>{this.overlay.remove();this.overlay=null;}}));
      const tabs = $("div",{class:"ghm-tabs"});
      ["home","repos","gists","releases","actions","settings"].forEach(t=>tabs.append($("button",{text:({home:"Dashboard",repos:"Repositories",gists:"Gists",releases:"Releases",actions:"Actions",settings:"Settings"})[t],onclick:()=>this.render(t)})));
      const main = $("div",{class:"ghm-main"});
      this.overlay.append(head,tabs,main,$("div",{class:"ghm-footer",text:"Token disimpan melalui encrypted Acode Plugin Context · Tindakan delete/commit memerlukan konfirmasi"}));
      if (!this.token) { this.loginView(main); return; }
      if (!this.user) { try { await this.loadUser(); } catch(e) { this.token=""; if(this.ctx) await this.ctx.deleteSecret("github_access_token"); this.loginView(main,e.message); return; } }
      if (tab==="home") await this.homeView(main);
      if (tab==="repos") await this.reposView(main);
      if (tab==="gists") await this.gistsView(main);
      if (tab==="releases") await this.releasesView(main);
      if (tab==="actions") await this.actionsView(main);
      if (tab==="settings") this.settingsView(main);
    }
    loginView(main, error="") {
      main.append($("h2",{text:"Hubungkan akun GitHub"}),$("p",{class:"ghm-muted",text:"Gunakan OAuth Device Flow. Buat OAuth App di GitHub Developer Settings dan aktifkan Enable Device Flow."}));
      if(error) main.append($("div",{class:"ghm-status",text:error}));
      const id=$("input",{placeholder:"GitHub OAuth App Client ID"});
      main.append($("label",{text:"OAuth Client ID"}),id,$("button",{class:"primary",text:"Login dengan GitHub",onclick:async()=>{try{await this.loginDevice(id.value);}catch(e){alert(e.message);}}}));
      main.append($("div",{class:"ghm-card"},[$("strong",{text:"Belum punya OAuth App?"}),$("p",{class:"ghm-small",text:"GitHub → Settings → Developer settings → OAuth Apps → New OAuth App. Aktifkan Device Flow. Client ID bukan rahasia; jangan pernah memasukkan Client Secret ke plugin."}),$("a",{href:"https://github.com/settings/developers",target:"_blank",text:"Buka GitHub Developer Settings"})]));
      const pat=$("input",{placeholder:"ghp_... / github_pat_...",type:"password"});
      main.append($("label",{text:"Alternatif: Personal Access Token"}),pat,$("button",{text:"Simpan PAT",onclick:async()=>{if(!pat.value.trim())return;this.token=pat.value.trim();try{await this.loadUser();if(this.ctx)await this.ctx.setSecret("github_access_token",this.token);this.render();}catch(e){this.token="";alert(e.message);}}}));
    }
    async homeView(main) {
      const repos=await this.request("/user/repos?per_page=100&sort=updated").catch(()=>[]);
      const gists=await this.request("/gists?per_page=100").catch(()=>[]);
      main.append($("h2",{text:"Dashboard"}),$("div",{class:"ghm-card"},[
        $("div",{class:"ghm-row"},[$("div",{},[$("div",{class:"ghm-muted",text:"Account"}),$("strong",{text:this.user.login})]),$("div",{},[$("div",{class:"ghm-muted",text:"Repositories"}),$("strong",{text:String(repos.length)})]),$("div",{},[$("div",{class:"ghm-muted",text:"Gists"}),$("strong",{text:String(gists.length)})])]),
        $("p",{class:"ghm-small",text:"Pilih tab untuk mengelola repository, Gist, release, dan workflow."})
      ]));
      main.append($("div",{class:"ghm-row"},[
        $("button",{class:"primary",text:"Refresh data",onclick:()=>this.render("home")}),
        $("button",{text:"Buka profil GitHub",onclick:()=>window.open(this.user.html_url,"_blank")}),
        $("button",{text:"Logout",onclick:()=>this.logout()})
      ]));
      main.append($("div",{class:"ghm-card"},[$("strong",{text:"Fitur tersedia"}),$("p",{class:"ghm-small",text:"Upload/edit/delete file · commit · branch · ZIP download · sync file pilihan · Gists · Releases · GitHub Actions."})]));
    }
    async reposView(main) {
      if (!this.repo) {
        const list=await this.request("/user/repos?per_page=100&sort=updated");
        main.append($("h2",{text:"Repositories"}));
        const createName=$("input",{placeholder:"Nama repository baru"});
        const priv=$("select",{},[$("option",{value:"true",text:"Private"}),$("option",{value:"false",text:"Public"})]);
        main.append($("label",{text:"Buat repository"}),createName,priv,$("button",{class:"primary",text:"Create repository",onclick:async()=>{try{const r=await this.request("/user/repos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:createName.value,private:priv.value==="true",auto_init:true})});alert("Repository dibuat: "+r.full_name);this.render("repos");}catch(e){alert(e.message);}}}));
        list.forEach(r=>main.append($("div",{class:"ghm-item"},[$("div",{},[$("strong",{text:r.full_name}),$("div",{class:"ghm-small",text:(r.private?"Private":"Public")+" · "+(r.description||"No description")})]),$("button",{text:"Open",onclick:()=>{this.repo=r;this.branch=r.default_branch;this.path="";this.render("repos");}})])));
        return;
      }
      main.append($("div",{class:"ghm-row"},[$("button",{text:"← Repositories",onclick:()=>{this.repo=null;this.render("repos");}}),$("strong",{text:this.repo.full_name})]));
      const branches=await this.request(`/repos/${this.repo.full_name}/branches?per_page=100`);
      const branchSel=$("select",{},branches.map(b=>$("option",{value:b.name,text:b.name})));
      branchSel.value=this.branch;
      branchSel.addEventListener("change",()=>{this.branch=branchSel.value;this.path="";this.render("repos");});
      const newBranch=$("input",{placeholder:"New branch name"});
      main.append($("label",{text:"Branch"}),branchSel,$("div",{class:"ghm-row"},[newBranch,$("button",{text:"Create branch",onclick:async()=>{try{const base=await this.request(`/repos/${this.repo.full_name}/git/ref/heads/${encodeURIComponent(this.branch)}`);await this.request(`/repos/${this.repo.full_name}/git/refs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:"refs/heads/"+newBranch.value,sha:base.object.sha})});alert("Branch dibuat");this.render("repos");}catch(e){alert(e.message);}}})]));
      const crumb=$("div",{class:"ghm-muted",text:"/"+this.path});main.append(crumb);
      const contents=await this.request(`/repos/${this.repo.full_name}/contents/${this.path?this.path.split("/").map(encodeURIComponent).join("/"):""}?ref=${encodeURIComponent(this.branch)}`);
      const items=Array.isArray(contents)?contents:[contents];
      if(this.path) main.append($("button",{text:"↑ Parent folder",onclick:()=>{this.path=this.path.split("/").slice(0,-1).join("/");this.render("repos");}}));
      items.forEach(item=>main.append($("div",{class:"ghm-item"},[$("div",{},[$("strong",{text:(item.type==="dir"?"📁 ":"📄 ")+item.name}),$("div",{class:"ghm-small",text:item.type+" · "+item.path})]),$("div",{class:"ghm-row"},[
        $("button",{text:item.type==="dir"?"Open":"Edit",onclick:()=>{if(item.type==="dir"){this.path=item.path;this.render("repos");}else this.editFile(item);}}),
        $("button",{class:"danger",text:"Delete",onclick:()=>this.deleteFile(item)})
      ])])));
      const newPath=$("input",{placeholder:"path/to/file.txt"});
      const newText=$("textarea",{placeholder:"File content"});
      const commit=$("input",{placeholder:"Commit message",value:"Add file via Acode"});
      main.append($("div",{class:"ghm-card"},[$("strong",{text:"Create / Upload text file"}),newPath,newText,commit,$("button",{class:"primary",text:"Commit file",onclick:async()=>{try{await this.putContent(newPath.value,newText.value,commit.value);this.render("repos");}catch(e){alert(e.message);}}})]));
      const picker=$("input",{type:"file",multiple:"multiple"});
      main.append($("div",{class:"ghm-card"},[$("strong",{text:"Upload local files"}),picker,$("input",{id:"ghm-upload-message",placeholder:"Commit message",value:"Upload from Acode"}),$("button",{class:"primary",text:"Upload selected files",onclick:async()=>{try{for(const f of Array.from(picker.files||[])){const content=await f.text();await this.putContent((this.path?this.path+"/":"")+f.name,content,document.getElementById("ghm-upload-message").value);}alert("Upload selesai");this.render("repos");}catch(e){alert(e.message);}}})]));
      main.append($("div",{class:"ghm-card"},[$("strong",{text:"Download repository ZIP"}),$("button",{text:"Download ZIP",onclick:()=>window.open(this.repo.archive_url.replace("{archive_format}","zipball").replace("{/ref}",`/${encodeURIComponent(this.branch)}`),"_blank")}),$("p",{class:"ghm-small",text:"Membuka archive ZIP GitHub pada browser. Akses private repository mengikuti sesi login browser."})]));
      main.append($("div",{class:"ghm-card"},[$("strong",{text:"Sync"}),$("p",{class:"ghm-small",text:"Pilih beberapa file lokal untuk mengunggah/sinkronkan ke branch aktif. Upload menggunakan Contents API dan tiap file menghasilkan commit tersendiri."}),$("button",{text:"Refresh / Pull latest",onclick:()=>this.render("repos")})]));
    }
    async putContent(path, content, message) {
      if(!path.trim()) throw new Error("Path file wajib diisi.");
      const encoded=btoa(unescape(encodeURIComponent(content)));
      let sha;
      try { const old=await this.request(`/repos/${this.repo.full_name}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(this.branch)}`);sha=old.sha; } catch(e) {}
      return this.request(`/repos/${this.repo.full_name}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:message||"Update via Acode",content:encoded,branch:this.branch,...(sha?{sha}:{})})});
    }
    async editFile(item) {
      try {
        const data=await this.request(`/repos/${this.repo.full_name}/contents/${item.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(this.branch)}`);
        const content=decodeURIComponent(escape(atob(data.content.replace(/\n/g,""))));
        const area=$("textarea",{text:content}); const message=$("input",{value:"Update "+item.path});
        const wrap=$("div",{class:"ghm"});
        wrap.style.zIndex="100001";wrap.append($("div",{class:"ghm-head"},[$("strong",{text:"Edit "+item.path}),$("button",{text:"Close",onclick:()=>wrap.remove()})]));
        wrap.append($("div",{class:"ghm-main"},[area,message,$("button",{class:"primary",text:"Save & Commit",onclick:async()=>{try{await this.request(`/repos/${this.repo.full_name}/contents/${item.path.split("/").map(encodeURIComponent).join("/")}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:message.value,content:btoa(unescape(encodeURIComponent(area.value))),sha:data.sha,branch:this.branch})});wrap.remove();alert("File tersimpan dan commit berhasil.");this.render("repos");}catch(e){alert(e.message);}}})]));
        document.body.append(wrap);
      }catch(e){alert(e.message);}
    }
    async deleteFile(item) {
      if(!confirm(`Hapus ${item.path} dari branch ${this.branch}? Tindakan ini membuat commit.`))return;
      try {const data=await this.request(`/repos/${this.repo.full_name}/contents/${item.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(this.branch)}`);await this.request(`/repos/${this.repo.full_name}/contents/${item.path.split("/").map(encodeURIComponent).join("/")}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"Delete "+item.path,sha:data.sha,branch:this.branch})});this.render("repos");}catch(e){alert(e.message);}
    }
    async gistsView(main) {
      main.append($("h2",{text:"Gists"}));
      const desc=$("input",{placeholder:"Gist description"});
      const name=$("input",{placeholder:"filename.txt"});
      const body=$("textarea",{placeholder:"Gist content"});
      const priv=$("select",{},[$("option",{value:"true",text:"Secret gist"}),$("option",{value:"false",text:"Public gist"})]);
      main.append($("div",{class:"ghm-card"},[$("strong",{text:"Create Gist"}),desc,name,body,priv,$("button",{class:"primary",text:"Create Gist",onclick:async()=>{try{await this.request("/gists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({description:desc.value,public:priv.value==="false",files:{[name.value||"note.txt"]:{content:body.value}}})});this.render("gists");}catch(e){alert(e.message);}}})]));
      const gists=await this.request("/gists?per_page=100");
      gists.forEach(g=>main.append($("div",{class:"ghm-item"},[$("div",{},[$("strong",{text:g.description||Object.keys(g.files).join(", ")}),$("div",{class:"ghm-small",text:g.id+" · "+(g.public?"Public":"Secret")})]),$("div",{class:"ghm-row"},[$("button",{text:"Open",onclick:()=>window.open(g.html_url,"_blank")}),$("button",{class:"danger",text:"Delete",onclick:async()=>{if(confirm("Hapus Gist ini permanen?"))try{await this.request("/gists/"+g.id,{method:"DELETE"});this.render("gists");}catch(e){alert(e.message);}}})])])));
    }
    async releasesView(main) {
      if(!this.repo){main.append($("h2",{text:"Releases"}),$("p",{text:"Buka Repositories lalu pilih repository untuk mengelola release."}));return;}
      main.append($("h2",{text:"Releases · "+this.repo.full_name}));
      const tag=$("input",{placeholder:"Tag, contoh v1.0.0"}), title=$("input",{placeholder:"Release title"}), body=$("textarea",{placeholder:"Release notes"});
      main.append($("div",{class:"ghm-card"},[tag,title,body,$("button",{class:"primary",text:"Create release",onclick:async()=>{try{await this.request(`/repos/${this.repo.full_name}/releases`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag_name:tag.value,name:title.value,body:body.value,draft:false,prerelease:false})});this.render("releases");}catch(e){alert(e.message);}}})]));
      const releases=await this.request(`/repos/${this.repo.full_name}/releases?per_page=50`);
      releases.forEach(r=>main.append($("div",{class:"ghm-card"},[$("strong",{text:r.name||r.tag_name}),$("p",{class:"ghm-small",text:r.tag_name+" · "+r.published_at}),$("button",{text:"Open release",onclick:()=>window.open(r.html_url,"_blank")}),$("button",{class:"danger",text:"Delete",onclick:async()=>{if(confirm("Hapus release ini?"))try{await this.request(`/repos/${this.repo.full_name}/releases/${r.id}`,{method:"DELETE"});this.render("releases");}catch(e){alert(e.message);}}})])));
    }
    async actionsView(main) {
      if(!this.repo){main.append($("h2",{text:"GitHub Actions"}),$("p",{text:"Buka Repositories lalu pilih repository untuk melihat workflow runs."}));return;}
      main.append($("h2",{text:"Actions · "+this.repo.full_name}));
      const runs=await this.request(`/repos/${this.repo.full_name}/actions/runs?per_page=50`);
      (runs.workflow_runs||[]).forEach(r=>main.append($("div",{class:"ghm-card"},[$("strong",{text:r.name}),$("div",{class:"ghm-small",text:r.status+" / "+r.conclusion+" · "+r.head_branch}),$("div",{class:"ghm-row"},[$("button",{text:"Open run",onclick:()=>window.open(r.html_url,"_blank")}),$("button",{text:"Re-run",onclick:async()=>{if(confirm("Jalankan ulang workflow ini?"))try{await this.request(`/repos/${this.repo.full_name}/actions/runs/${r.id}/rerun`,{method:"POST"});alert("Workflow diminta untuk dijalankan ulang.");}catch(e){alert(e.message);}}})])])));
    }
    settingsView(main) {
      main.append($("h2",{text:"Settings"}),$("div",{class:"ghm-card"},[$("p",{text:"Akun: @"+(this.user?this.user.login:"unknown")}),$("p",{class:"ghm-small",text:"Token disimpan terenkripsi melalui Acode Plugin Context. Logout menghapus token lokal dari storage plugin."}),$("button",{class:"danger",text:"Logout & hapus token",onclick:()=>this.logout()})]));
    }
  }
  if (window.acode) {
    const app = new GitHubManager();
    acode.setPluginInit(PLUGIN_ID, async (baseUrl, page, options) => app.init(baseUrl,page,options));
    acode.setPluginUnmount(PLUGIN_ID, () => app.destroy());
  }
})();
