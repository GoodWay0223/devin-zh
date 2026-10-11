using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public class DevinZhWindow : Form {
    readonly string projectDir;
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    Label stage, detail, steps, installTitle;
    ComboBox locations;
    RadioButton full, chat;
    Button start, restore, more, pick;
    ProgressBar bar;
    Process job;
    string root, reportFile, logFile, action;
    bool hasResult, outputDone, errorDone, closing, needNode;
    readonly StringBuilder errors = new StringBuilder();

    sealed class InstallChoice {
        public string Root, Location, Version;
        public override string ToString() { return "Devin " + Version + " · " + Location; }
    }
    static string TextOf(IDictionary<string,object> obj, string key) { return obj.ContainsKey(key) && obj[key] != null ? Convert.ToString(obj[key]) : ""; }
    static double NumberOf(IDictionary<string,object> obj, string key) { double n; return Double.TryParse(TextOf(obj,key),out n) ? n : 0; }
    static bool Flag(IDictionary<string,object> obj, string key) { return TextOf(obj,key).Equals("True",StringComparison.OrdinalIgnoreCase); }
    static Dictionary<string,object> Request(string command, string root = null) {
        var request = new Dictionary<string,object> { {"command",command} };
        if (root != null) request["root"] = root;
        return request;
    }
    Label LabelAt(string text, int x, int y, int width, int height, float size = 10, bool bold = false) {
        var label = new Label { Text=text, Location=new Point(x,y), Size=new Size(width,height),
            Font=new Font("Microsoft YaHei UI",size,bold?FontStyle.Bold:FontStyle.Regular), ForeColor=Color.FromArgb(45,55,72) };
        Controls.Add(label); return label;
    }
    Button ButtonAt(string text, int x, int y, int width, int height) {
        var button = new Button {Text=text,Location=new Point(x,y),Size=new Size(width,height),FlatStyle=FlatStyle.Flat};
        button.FlatAppearance.BorderColor=Color.FromArgb(214,222,235); button.BackColor=Color.White;
        Controls.Add(button); return button;
    }
    static Bitmap ProjectBadge(string directory) {
        using(var stream=File.OpenRead(Path.Combine(directory,"assets","devin-zh-128.png")))
        using(var image=Image.FromStream(stream)) return new Bitmap(image);
    }
    static Icon ProjectIcon(string directory) {
        using(var icon=new Icon(Path.Combine(directory,"assets","devin-zh.ico"))) return (Icon)icon.Clone();
    }
    public DevinZhWindow(string directory) {
        SuspendLayout();
        AutoScaleDimensions=new SizeF(96F,96F); AutoScaleMode=AutoScaleMode.Dpi;
        projectDir=Path.GetFullPath(directory);
        var metadata=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(projectDir,"package.json")));
        string version=TextOf(metadata,"version"), author=TextOf(metadata,"author"), repository=TextOf(metadata,"homepage");
        Text="Devin 汉化工具"; ClientSize=new Size(680,545); StartPosition=FormStartPosition.CenterScreen;
        Font=new Font("Microsoft YaHei UI",10); BackColor=Color.FromArgb(247,249,252);
        FormBorderStyle=FormBorderStyle.FixedDialog; MaximizeBox=false;
        Icon=ProjectIcon(projectDir);
        var badge=new PictureBox {Location=new Point(30,26),Size=new Size(36,36),Image=ProjectBadge(projectDir),SizeMode=PictureBoxSizeMode.Zoom};
        Controls.Add(badge);
        LabelAt("Devin 简体中文汉化",78,22,475,42,21);
        LabelAt("v"+version,572,31,85,25);
        LabelAt("聊天界面和编辑器菜单，自动准备，一键应用。",30,71,620,26);
        installTitle=LabelAt("正在查找 Devin…",30,114,620,27,11,true);
        locations=new ComboBox {Location=new Point(30,148),Size=new Size(531,30),DropDownStyle=ComboBoxStyle.DropDownList};
        Controls.Add(locations); pick=ButtonAt("选择程序",573,146,79,32);
        full=new RadioButton {Text="完整汉化（推荐）",Checked=true,Location=new Point(32,202),Size=new Size(600,30),Font=new Font(Font.FontFamily,11,FontStyle.Bold)};
        Controls.Add(full);
        LabelAt("聊天界面 + 编辑器菜单；中文资源自动准备，首次可能联网。",57,236,591,25);
        chat=new RadioButton {Text="仅汉化聊天界面",Location=new Point(32,272),Size=new Size(600,30)};
        Controls.Add(chat);
        stage=LabelAt("正在启动…",30,327,533,27,11,true);
        steps=LabelAt("",563,328,91,25,9); steps.TextAlign=ContentAlignment.MiddleRight;
        bar=new ProgressBar {Location=new Point(30,362),Size=new Size(622,12),Style=ProgressBarStyle.Marquee,MarqueeAnimationSpeed=28}; Controls.Add(bar);
        detail=LabelAt("准备时可继续使用 Devin，应用前请保存工作并退出。",30,386,621,45,9);
        detail.ForeColor=Color.FromArgb(100,112,132);
        start=ButtonAt("开始汉化",30,445,222,44);
        start.BackColor=Color.FromArgb(37,99,235); start.ForeColor=Color.White; start.FlatAppearance.BorderSize=0;
        start.Font=new Font(Font.FontFamily,11,FontStyle.Bold);
        restore=ButtonAt("恢复原版",269,445,158,44); more=ButtonAt("更多操作",445,445,207,44);
        var footer=LabelAt("作者："+author,30,513,205,23,9); footer.ForeColor=Color.FromArgb(100,112,132);
        Action openRepository=()=>{
            try {Process.Start(new ProcessStartInfo {FileName=repository,UseShellExecute=true});}
            catch(Exception error) {MessageBox.Show(this,"无法打开浏览器，可复制项目地址访问：\n"+repository+"\n\n"+error.Message,"项目 GitHub",MessageBoxButtons.OK,MessageBoxIcon.Information);}
        };
        var projectLink=new LinkLabel {Text="GitHub · GoodWay0223/devin-zh",Height=25,Anchor=AnchorStyles.Right|AnchorStyles.Bottom,
            Font=new Font(Font.FontFamily,9),LinkColor=Color.FromArgb(37,99,235),ActiveLinkColor=Color.FromArgb(29,78,216),
            LinkBehavior=LinkBehavior.HoverUnderline,AccessibleDescription=repository,TextAlign=ContentAlignment.MiddleRight,
            ImageAlign=ContentAlignment.MiddleLeft,Cursor=Cursors.Hand};
        using(var stream=File.OpenRead(Path.Combine(projectDir,"assets","github-mark-black.png")))
        using(var image=Image.FromStream(stream)) projectLink.Image=new Bitmap(image,new Size(18,18));
        projectLink.Width=TextRenderer.MeasureText(projectLink.Text,projectLink.Font).Width+26;
        projectLink.Location=new Point(ClientSize.Width-30-projectLink.Width,511);
        projectLink.LinkClicked+=(s,e)=>openRepository();
        projectLink.MouseClick+=(s,e)=>{if(e.Button==MouseButtons.Left && e.X<26)openRepository();};
        Controls.Add(projectLink);
        var tooltip=new ToolTip();tooltip.SetToolTip(projectLink,repository);
        FormClosed+=(s,e)=>{badge.Image.Dispose();projectLink.Image.Dispose();Icon.Dispose();tooltip.Dispose();};
        AcceptButton=start;
        start.Click+=(s,e)=>{
            if (needNode) {Process.Start("https://nodejs.org/zh-cn/download");return;}
            var request=Request(reportFile==null?"prepare":"apply",root);
            if (reportFile==null) request["scope"]=full.Checked?"all":"web"; else request["reportFile"]=reportFile;
            StartJob(request);
        };
        restore.Click+=(s,e)=>{
            if (MessageBox.Show(this,"请先保存工作并完全退出 Devin。继续后恢复当前版本原版，保留本机恢复备份。","恢复原版",MessageBoxButtons.YesNo,MessageBoxIcon.Question)==DialogResult.Yes) {
                ResetPlan(); StartJob(Request("restore",root));
            }
        };
        locations.SelectedIndexChanged+=(s,e)=>{
            var selected=locations.SelectedItem as InstallChoice;
            if(selected!=null){root=selected.Root;ResetPlan();if(job==null)EnableControls(true);}
        };
        full.CheckedChanged+=(s,e)=>{if(job==null)ResetPlan();};
        pick.Click+=(s,e)=>{using(var dialog=new OpenFileDialog {Title="选择 Devin.exe",Filter="Devin 主程序 (Devin.exe)|Devin.exe"}) {
            if(dialog.ShowDialog(this)==DialogResult.OK){ResetPlan();StartJob(Request("detect",dialog.FileName));}
        }};
        var menu=new ContextMenuStrip();
        menu.Items.Add("检查安装",null,(s,e)=>StartJob(Request("status",root)));
        menu.Items.Add("恢复中断操作",null,(s,e)=>{ResetPlan();StartJob(Request("recover",root));});
        menu.Items.Add("打开详细日志",null,(s,e)=>{if(logFile!=null && File.Exists(logFile))Process.Start("notepad.exe","\""+logFile+"\"");});
        more.Click+=(s,e)=>menu.Show(more,0,more.Height);
        FormClosing+=(s,e)=>{
            if(job==null)return;
            e.Cancel=true;
            if(action=="apply"||action=="restore"||action=="recover") {detail.Text="正在写入或恢复安装文件，请等待完成后再关闭。";return;}
            closing=true; stage.Text="正在取消准备…";
            try {job.StandardInput.WriteLine("{\"command\":\"cancel\"}");}catch{}
        };
        Shown+=(s,e)=>StartJob(Request("detect"));
        EnableControls(false);
        ResumeLayout(false);
    }
    void ResetPlan(){reportFile=null;start.Text="开始汉化";}
    void EnableControls(bool enabled){
        start.Enabled=enabled && root!=null; restore.Enabled=enabled && root!=null;
        full.Enabled=chat.Enabled=pick.Enabled=locations.Enabled=more.Enabled=enabled;
    }
    string FindNode(){
        foreach(var directory in (Environment.GetEnvironmentVariable("PATH")??"").Split(Path.PathSeparator)) {
            try {var file=Path.Combine(directory.Trim('"'),"node.exe");if(File.Exists(file))return file;}catch{}
        }
        var standard=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"nodejs","node.exe");
        return File.Exists(standard)?standard:null;
    }
    void Post(Action callback){if(IsDisposed)return;try{BeginInvoke(callback);}catch(InvalidOperationException){}}
    void StartJob(Dictionary<string,object> request){
        if(job!=null)return;
        var node=FindNode();
        if(node==null){
            stage.Text="请先安装 Node.js";bar.Style=ProgressBarStyle.Continuous;bar.Value=0;
            detail.Text="只需安装一次，推荐 Node.js 24 LTS；安装后重新打开此窗口。";
            start.Text="打开官方下载页";start.Enabled=true;needNode=true;return;
        }
        needNode=false;EnableControls(false);hasResult=outputDone=errorDone=false;errors.Clear();action=TextOf(request,"command");
        stage.ForeColor=Color.FromArgb(45,55,72);stage.Text="正在准备…";steps.Text="";bar.Style=ProgressBarStyle.Marquee;
        detail.Text="正在处理，请保持窗口打开。详细信息会保存到本机日志。";
        var process=new Process {StartInfo=new ProcessStartInfo {
            FileName=node,Arguments="\""+Path.Combine(projectDir,"scripts","gui-backend.js")+"\"",WorkingDirectory=projectDir,
            UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,
            StandardOutputEncoding=new UTF8Encoding(false),StandardErrorEncoding=new UTF8Encoding(false)},EnableRaisingEvents=true};
        job=process;
        process.OutputDataReceived+=(s,e)=>Post(()=>{
            if(e.Data==null){outputDone=true;FinishIfExited(process);return;}
            try {HandleEvent(json.Deserialize<Dictionary<string,object>>(e.Data));}catch(Exception error){detail.Text="无法读取结果："+error.Message;}
        });
        process.ErrorDataReceived+=(s,e)=>Post(()=>{if(e.Data==null){errorDone=true;FinishIfExited(process);}else errors.AppendLine(e.Data);});
        process.Exited+=(s,e)=>Post(()=>FinishIfExited(process));
        try {process.Start();process.BeginOutputReadLine();process.BeginErrorReadLine();process.StandardInput.WriteLine(json.Serialize(request));}
        catch(Exception error){job=null;process.Dispose();HandleEvent(new Dictionary<string,object>{{"type","error"},{"message",error.Message}});EnableControls(true);}
    }
    void FinishIfExited(Process process){
        if(job!=process || !outputDone || !errorDone || !process.HasExited)return;
        if(!hasResult)HandleEvent(new Dictionary<string,object>{{"type","error"},{"message",errors.Length>0?errors.ToString():"未收到操作结果，请查看详细日志。"}});
        job=null;process.Dispose();EnableControls(true);if(closing)Close();
    }
    void HandleEvent(Dictionary<string,object> data){
        string type=TextOf(data,"type"), message=TextOf(data,"message");
        if(type=="log-file"){logFile=TextOf(data,"path");return;}
        if(type=="progress"){
            stage.Text=message;double total=NumberOf(data,"total"), completed=NumberOf(data,"completed");
            if(total>0){
                bar.Style=ProgressBarStyle.Continuous;bar.Value=Math.Min(100,Math.Max(0,(int)(completed/total*100)));
                if(TextOf(data,"unit")=="bytes") {
                    steps.Text=bar.Value+"%";detail.Text=String.Format("已下载 {0:N1} / {1:N1} MB",completed/1048576,total/1048576);
                }else{
                    steps.Text=completed+"/"+total+" 步骤";detail.Text="进度按已完成的步骤计数；大型界面解析可能需要几分钟。";
                }
            }else {bar.Style=Flag(data,"busy")?ProgressBarStyle.Marquee:ProgressBarStyle.Continuous;steps.Text="";}
            return;
        }
        hasResult=true;
        if(type=="detected"){
            locations.Items.Clear();var installs=data["installations"] as IEnumerable;
            if(installs!=null)foreach(var item in installs){var info=item as Dictionary<string,object>;if(info!=null)locations.Items.Add(new InstallChoice{Root=TextOf(info,"root"),Location=TextOf(info,"location"),Version=TextOf(info,"version")});}
            root=null;
            if(locations.Items.Count==1){locations.SelectedIndex=0;root=((InstallChoice)locations.Items[0]).Root;installTitle.Text="已找到 Devin";stage.Text="准备就绪";}
            else if(locations.Items.Count>1){installTitle.Text="发现多个安装，请选择";stage.Text="选择要汉化的 Devin";}
            else{installTitle.Text="没有找到 Devin";stage.Text="点击“选择程序”，选中 Devin.exe";}
            bar.Style=ProgressBarStyle.Continuous;bar.Value=0;detail.Text="选择汉化范围后点击“开始汉化”。编辑器中文资源会自动准备。";return;
        }
        if(type=="prepared"){
            reportFile=TextOf(data,"reportFile");start.Text="应用汉化";stage.Text="汉化已准备好";steps.Text="准备完成";
            bar.Style=ProgressBarStyle.Continuous;bar.Value=100;detail.Text="请保存工作并完全退出 Devin，再点击“应用汉化”。当前安装尚未修改。";return;
        }
        if(type=="done"||type=="checked"){
            ResetPlan();stage.Text=message;stage.ForeColor=Color.FromArgb(21,128,61);steps.Text="完成";bar.Style=ProgressBarStyle.Continuous;bar.Value=100;
            detail.Text="操作已完成，恢复备份与详细日志保存在本机。";return;
        }
        if(type=="cancelled"){ResetPlan();stage.Text="已取消准备";bar.Style=ProgressBarStyle.Continuous;bar.Value=0;detail.Text="Devin 安装未修改。";return;}
        if(type=="error"){
            stage.Text="这次操作未完成";stage.ForeColor=Color.FromArgb(185,28,28);bar.Style=ProgressBarStyle.Continuous;bar.Value=0;steps.Text="";
            if(message.Contains("语言包")||message.Contains("中文资源")||message.Contains("Marketplace"))detail.Text="未能取得匹配的编辑器中文资源。可稍后重试，或选择“仅汉化聊天界面”。";
            else if(message.Contains("正在运行")||message.Contains("完全退出"))detail.Text="请先保存工作并完全退出 Devin，再点击“应用汉化”重试。";
            else detail.Text=message;
            if(data.ContainsKey("logFile"))logFile=TextOf(data,"logFile");
        }
    }
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [STAThread] public static void Main(string[] args){
        SetProcessDPIAware();Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        try {Application.Run(new DevinZhWindow(args.Length>0?args[0]:Environment.GetEnvironmentVariable("DEVIN_ZH_GUI_PROJECT")));}
        catch(Exception error){MessageBox.Show(error.Message,"Devin 汉化工具无法启动",MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }
}
