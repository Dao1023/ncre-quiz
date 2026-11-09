#!/usr/bin/env node
/**
 * 生成示例题库 data/questions.json
 * 运行：node tools/make-sample-bank.mjs
 *
 * 题目内容按 NCRE 一级计算机基础、二级 C 语言、三级网络技术、
 * 二级 MS Office 的常见考点自行编写，用于演示各种题型与排版。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'data', 'questions.json');

const SUBJECTS = [
  { code: 'CJXXJSCLY', name: '一级 计算机基础' },
  { code: 'CYYY', name: '二级 C 语言程序设计' },
  { code: 'WLSJ', name: '三级 网络技术' },
  { code: 'MSOFFICE', name: '二级 MS Office' }
];

let seq = 0;
const opt = (...texts) => texts.map((text, i) => ({ key: 'ABCDEF'[i], text }));

function q(subject, type, stem, options, answer, explain, extra = {}) {
  seq += 1;
  return {
    id: String(10000 + seq),
    subject,
    type,
    stem,
    options: options || [],
    answer,
    explain: explain || '',
    images: extra.images || [],
    tags: extra.tags || []
  };
}

const questions = [];

/* ---------------- 一级 计算机基础 ---------------- */
questions.push(
  q('CJXXJSCLY', 'single',
    '<p>二进制数 <code>1011</code> 转换成十进制数是（　　）。</p>',
    opt('9', '11', '13', '15'), 'B',
    '<p>按权展开：1×2³ + 0×2² + 1×2¹ + 1×2⁰ = 8 + 0 + 2 + 1 = 11。</p>',
    { tags: ['单选', '第1章 数制'] }),

  q('CJXXJSCLY', 'single',
    '<p>1KB 等于（　　）字节。</p>',
    opt('1000', '1024', '1024×1024', '8'), 'B',
    '<p>计算机中 1KB = 2¹⁰ B = 1024B；1MB = 1024KB。</p>',
    { tags: ['单选', '存储单位'] }),

  q('CJXXJSCLY', 'single',
    '<p>在 GB2312 国标码中，存储一个汉字需要（　　）个字节。</p>',
    opt('1', '2', '4', '8'), 'B',
    '<p>GB2312 用两个字节表示一个汉字，每个字节最高位为 1，用于与 ASCII 字符区分。</p>',
    { tags: ['单选', '编码'] }),

  q('CJXXJSCLY', 'single',
    '<p>下列存储器中，断电后所存信息会丢失的是（　　）。</p>',
    opt('ROM', 'RAM', '硬盘', 'U 盘'), 'B',
    '<p>RAM（随机存取存储器）靠电容保存信息，断电即丢失；ROM、硬盘、U 盘均为非易失性存储。</p>',
    { tags: ['单选', '存储器'] }),

  q('CJXXJSCLY', 'single',
    '<p>中央处理器（CPU）主要由（　　）组成。</p>',
    opt('运算器和控制器', '运算器和内存', '控制器和寄存器', '硬盘和内存'), 'A',
    '<p>CPU 由运算器（ALU）和控制器（CU）构成，寄存器组通常作为 CPU 内部的组成部分。</p>',
    { tags: ['单选', '硬件'] }),

  q('CJXXJSCLY', 'single',
    '<p>域名 <code>www.ncre.cn</code> 中，<code>cn</code> 表示（　　）。</p>',
    opt('组织机构名', '国家或地区代码', '网络名', '主机名'), 'B',
    '<p>DNS 域名从右向左级别降低：cn 是国家/地区顶级域名，ncre 是机构名，www 是主机名。</p>',
    { tags: ['单选', '网络基础'] }),

  q('CJXXJSCLY', 'single',
    '<p>计算机病毒的本质是（　　）。</p>',
    opt('一种生物病毒', '一段具有破坏性的程序代码', '硬件故障', '电磁干扰'), 'B',
    '<p>计算机病毒是编制或插入计算机程序中、破坏计算机功能或数据、影响计算机使用并能自我复制的一组计算机指令或程序代码。</p>',
    { tags: ['单选', '安全'] }),

  q('CJXXJSCLY', 'single',
    '<p>在计算机中，1 个字节由（　　）个二进制位组成。</p>',
    opt('4', '16', '8', '2'), 'C',
    '<p>1 Byte = 8 bit，字节是计算机中最小的寻址单位。</p>',
    { tags: ['单选', '存储单位'] }),

  q('CJXXJSCLY', 'multi',
    '<p>下列设备中，属于输入设备的有（　　）。</p>',
    opt('键盘', '鼠标', '显示器', '扫描仪'), 'ABD',
    '<p>键盘、鼠标、扫描仪都把外部信息送入计算机，属于输入设备；显示器用于输出，属于输出设备。</p>',
    { tags: ['多选', '硬件'] }),

  q('CJXXJSCLY', 'judge',
    '<p>操作系统是计算机系统中最重要的系统软件。</p>',
    [], '对',
    '<p>操作系统管理计算机的硬件和软件资源，为其他软件提供运行环境，是最基本的系统软件。</p>',
    { tags: ['判断', '软件系统'] }),

  q('CJXXJSCLY', 'fill',
    '<p>1GB 等于 ________ MB。</p>',
    [], '1024',
    '<p>存储单位按 2¹⁰ 进位：1GB = 1024MB，1MB = 1024KB。</p>',
    { tags: ['填空', '存储单位'] }),

  q('CJXXJSCLY', 'single',
    '<p>在 Windows 中，将选中内容复制到剪贴板的快捷键是（　　）。</p>',
    opt('Ctrl+V', 'Ctrl+C', 'Ctrl+X', 'Ctrl+Z'), 'B',
    '',
    { tags: ['单选', '操作系统'] }),

  q('CJXXJSCLY', 'essay',
    '<p>简述计算机硬件系统的五大组成部分，并说明各自的作用。</p>',
    [], '运算器、控制器、存储器、输入设备、输出设备。',
    '<p>运算器负责算术运算和逻辑运算；控制器协调各部件工作；存储器存放程序和数据；输入设备把信息送入计算机；输出设备把处理结果送出。运算器与控制器合称 CPU。</p>',
    { tags: ['简答', '硬件'] })
);

/* ---------------- 二级 C 语言 ---------------- */
questions.push(
  q('CYYY', 'single',
    '<p>一个 C 程序总是从（　　）开始执行。</p>',
    opt('程序的第一条语句', 'main 函数', '包含的头文件', '第一个自定义函数'), 'B',
    '<p>无论 main 函数写在源文件的什么位置，C 程序都从 main 函数的第一条可执行语句开始执行。</p>',
    { tags: ['单选', '程序结构'] }),

  q('CYYY', 'single',
    '<p>以下程序的输出结果是（　　）。</p>' +
    '<pre><code>int x = 3;\nprintf("%d", x++);</code></pre>',
    opt('3', '4', '5', '0'), 'A',
    '<p><code>x++</code> 是后缀自增：先取 x 的原值 3 参与输出，然后 x 变为 4，因此输出 3。</p>',
    { tags: ['单选', '运算符'] }),

  q('CYYY', 'single',
    '<p>表达式 <code>5 / 2</code> 的值是（　　）。</p>',
    opt('2', '2.5', '3', '0'), 'A',
    '<p>两个操作数都是 int，执行整数除法，结果截断取整为 2；若要得到 2.5 应写成 <code>5.0 / 2</code>。</p>',
    { tags: ['单选', '运算符'] }),

  q('CYYY', 'single',
    '<p>定义 <code>int a[5];</code> 后，数组 a 的合法下标范围是（　　）。</p>',
    opt('1～5', '0～5', '0～4', '1～4'), 'C',
    '<p>C 数组下标从 0 开始，长度为 5 的数组下标为 0、1、2、3、4，共 5 个元素。</p>',
    { tags: ['单选', '数组'] }),

  q('CYYY', 'single',
    '<p>若有 <code>int a = 10, *p = &amp;a;</code>，则 <code>*p</code> 表示（　　）。</p>',
    opt('变量 a 的地址', '变量 a 的值', '指针 p 的地址', '变量 p 的值'), 'B',
    '<p><code>p</code> 存放 a 的地址，<code>*p</code> 是解引用，访问 p 所指向单元的内容，即 a 的值 10。</p>',
    { tags: ['单选', '指针'] }),

  q('CYYY', 'single',
    '<p>字符串 <code>"abc"</code> 在内存中占用的字节数是（　　）。</p>',
    opt('3', '4', '5', '6'), 'B',
    '<p>字符串以 <code>\\0</code> 作为结束标志，a、b、c 三个字符加一个结束符，共 4 个字节。</p>',
    { tags: ['单选', '字符串'] }),

  q('CYYY', 'judge',
    '<p>do-while 循环的循环体至少会执行一次。</p>',
    [], '对',
    '<p>do-while 先执行循环体、后判断条件，因此即使条件一开始就为假，循环体也会执行一次。</p>',
    { tags: ['判断', '循环'] }),

  q('CYYY', 'fill',
    '<p>语句 <code>for (i = 0; i &lt; 5; i++)</code> 的循环体共执行 ________ 次。</p>',
    [], '5',
    '<p>i 依次取 0、1、2、3、4，共 5 次；当 i 变为 5 时条件不成立，循环结束。</p>',
    { tags: ['填空', '循环'] }),

  q('CYYY', 'judge',
    '<p>在 C 语言中，可以用赋值语句把一个数组整体赋给另一个数组。</p>',
    [], '错',
    '<p>数组名是常量指针，不能作为整体赋值的目标；应使用循环或 <code>memcpy</code> 等函数逐个元素复制。</p>',
    { tags: ['判断', '数组'] }),

  q('CYYY', 'multi',
    '<p>下列属于 C 语言基本数据类型的有（　　）。</p>',
    opt('int', 'float', 'char', 'string'), 'ABC',
    '<p>C 语言的基本类型包括整型 int、实型 float/double、字符型 char 等；string 不是 C 的基本类型，字符串用字符数组表示。</p>',
    { tags: ['多选', '数据类型'] }),

  q('CYYY', 'single',
    '<p>若有结构体变量 <code>struct Student s;</code>，访问其成员 name 应使用（　　）。</p>',
    opt('s.name', 's-&gt;name', 's::name', '*s.name'), 'A',
    '<p>结构体变量用成员运算符 <code>.</code> 访问成员；结构体指针才用 <code>-&gt;</code>。</p>',
    { tags: ['单选', '结构体'] }),

  q('CYYY', 'single',
    '<p>函数内部定义的 <code>static</code> 局部变量，其生存期是（　　）。</p>',
    opt('所在函数执行期间', '所在语句块执行期间', '整个程序运行期间', '由程序员手动释放'), 'C',
    '<p>static 局部变量存放在静态存储区，只初始化一次，函数返回后仍保留，生存期贯穿整个程序运行期间，但作用域仍限于该函数。</p>',
    { tags: ['单选', '存储类别'] }),

  q('CYYY', 'single',
    '<p>以下程序段执行后，s 的值是（　　）。</p>' +
    '<pre><code>int i, s = 0;\nfor (i = 1; i &lt;= 10; i++)\n    if (i % 2 == 0) s += i;</code></pre>',
    opt('20', '25', '30', '55'), 'C',
    '<p>循环累加 1～10 中的偶数：2 + 4 + 6 + 8 + 10 = 30。</p>',
    { tags: ['单选', '循环'] }),

  q('CYYY', 'essay',
    '<p>简述指针与数组的联系和区别。</p>',
    [], '数组名在表达式中通常转换为指向首元素的指针；数组是连续存储的同类型元素集合，指针是存放地址的变量。',
    '<p>联系：数组名在大多数表达式中会退化为指向首元素的指针，因此可以用指针遍历数组，<code>a[i]</code> 与 <code>*(a+i)</code> 等价。<br>' +
    '区别：数组在定义时分配固定大小的连续内存，数组名是常量，不能被重新赋值；指针是变量，可以改变指向，也可以进行指针运算，但需要保证指向有效内存。</p>',
    { tags: ['简答', '指针'] })
);

/* ---------------- 三级 网络技术 ---------------- */
questions.push(
  q('WLSJ', 'single',
    '<p>在 OSI 参考模型中，负责路由选择的是（　　）。</p>',
    opt('物理层', '数据链路层', '网络层', '传输层'), 'C',
    '<p>网络层负责分组转发与路由选择，典型协议有 IP、ICMP、ARP 等。</p>',
    { tags: ['单选', 'OSI'] }),

  q('WLSJ', 'single',
    '<p>TCP 建立连接时需要经过（　　）。</p>',
    opt('一次握手', '三次握手', '四次握手', '两次握手'), 'B',
    '<p>TCP 通过 SYN、SYN-ACK、ACK 三次握手建立连接，以确保双方收发能力正常并同步序号。</p>',
    { tags: ['单选', 'TCP'] }),

  q('WLSJ', 'single',
    '<p>下列 IP 地址中，属于私有地址的是（　　）。</p>',
    opt('8.8.8.8', '192.168.1.10', '202.96.1.1', '172.32.0.1'), 'B',
    '<p>私有地址范围：10.0.0.0/8、172.16.0.0/12（172.16～172.31）、192.168.0.0/16。172.32.0.1 已超出 172.16～172.31，属于公网地址。</p>',
    { tags: ['单选', 'IP 地址'] }),

  q('WLSJ', 'single',
    '<p>子网掩码为 <code>255.255.255.0</code> 时，每个子网可分配的主机地址数是（　　）。</p>',
    opt('256', '254', '255', '128'), 'B',
    '<p>主机位 8 位，共 2⁸ = 256 个地址，去掉网络地址和广播地址，可用主机地址为 254 个。</p>',
    { tags: ['单选', '子网'] }),

  q('WLSJ', 'single',
    '<p>DNS 的主要功能是（　　）。</p>',
    opt('文件传输', '域名解析', '邮件收发', '远程登录'), 'B',
    '<p>DNS 把便于记忆的域名解析为 IP 地址；正向解析为域名→IP，反向解析为 IP→域名。</p>',
    { tags: ['单选', '应用层'] }),

  q('WLSJ', 'single',
    '<p>HTTP 协议默认使用的端口号是（　　）。</p>',
    opt('21', '25', '80', '443'), 'C',
    '<p>HTTP 默认端口 80，HTTPS 默认 443，FTP 控制端口 21，SMTP 默认 25。</p>',
    { tags: ['单选', '应用层'] }),

  q('WLSJ', 'single',
    '<p>以太网交换机主要工作在 OSI 模型的（　　）。</p>',
    opt('物理层', '数据链路层', '网络层', '应用层'), 'B',
    '<p>交换机根据 MAC 地址转发数据帧，工作在数据链路层；集线器工作在物理层，路由器工作在网络层。</p>',
    { tags: ['单选', '设备'] }),

  q('WLSJ', 'multi',
    '<p>下列协议中，属于传输层协议的有（　　）。</p>',
    opt('TCP', 'UDP', 'IP', 'ICMP'), 'AB',
    '<p>TCP 和 UDP 是传输层协议；IP、ICMP 属于网络层协议。</p>',
    { tags: ['多选', '协议'] }),

  q('WLSJ', 'judge',
    '<p>UDP 提供面向连接的可靠数据传输服务。</p>',
    [], '错',
    '<p>UDP 是无连接、不可靠的传输层协议，不保证顺序和到达；面向连接的可靠传输由 TCP 提供。</p>',
    { tags: ['判断', 'UDP'] }),

  q('WLSJ', 'fill',
    '<p>IPv4 地址的长度为 ________ 位二进制数。</p>',
    [], '32',
    '<p>IPv4 地址长 32 位，通常写成 4 段点分十进制；IPv6 地址长 128 位。</p>',
    { tags: ['填空', 'IP 地址'] }),

  q('WLSJ', 'single',
    '<p>下图为一个简单的网络拓扑。图中用于连接不同网段、并根据路由表选择转发路径的设备是（　　）。</p>' +
    '<p><img src="images/net-topology.svg" alt="两个网段通过一台设备互联的网络拓扑图"></p>',
    opt('集线器', '二层交换机', '路由器', '中继器'), 'C',
    '<p>路由器工作在网络层，能够连接不同网段（不同网络地址）并根据路由表选择路径；交换机只能在同一个广播域内按 MAC 转发，集线器和中继器只做信号放大。</p>',
    { tags: ['单选', '设备'], images: ['images/net-topology.svg'] }),

  q('WLSJ', 'single',
    '<p>下表是 IPv4 地址的分类范围。IP 地址 <code>192.168.0.1</code> 属于（　　）。</p>' +
    '<table><thead><tr><th>类别</th><th>第一字节范围</th><th>默认掩码</th></tr></thead>' +
    '<tbody><tr><td>A 类</td><td>1～126</td><td>255.0.0.0</td></tr>' +
    '<tr><td>B 类</td><td>128～191</td><td>255.255.0.0</td></tr>' +
    '<tr><td>C 类</td><td>192～223</td><td>255.255.255.0</td></tr></tbody></table>',
    opt('A 类地址', 'B 类地址', 'C 类地址', 'D 类地址'), 'C',
    '<p>192 落在 C 类地址的第一字节范围 192～223 内，因此 192.168.0.1 是 C 类地址（同时也是私有地址）。</p>',
    { tags: ['单选', 'IP 地址'] }),

  q('WLSJ', 'essay',
    '<p>简述 TCP 与 UDP 的主要区别，并各举一个典型应用场景。</p>',
    [], 'TCP 面向连接、可靠、有序、有流量控制和拥塞控制，开销大；UDP 无连接、不可靠、开销小、实时性好。',
    '<p>TCP：面向连接，通过三次握手建立连接，提供确认、重传、排序、流量控制和拥塞控制，适合对可靠性要求高的场景，如网页浏览（HTTP）、文件传输（FTP）、电子邮件（SMTP）。<br>' +
    'UDP：无连接，不保证可靠交付和顺序，首部仅 8 字节，传输开销小、延迟低，适合实时音视频、DNS 查询、在线游戏等场景。</p>',
    { tags: ['简答', 'TCP/UDP'] }),

  q('WLSJ', 'operation',
    '<p>【操作题】某单位分配到地址块 <code>192.168.1.0/24</code>，现需要划分为 4 个大小相同的子网。请写出：① 子网掩码；② 每个子网的网络地址和可用主机地址范围。</p>',
    [], '子网掩码 255.255.255.192；4 个子网为 192.168.1.0/26、192.168.1.64/26、192.168.1.128/26、192.168.1.192/26。',
    '<p>划分 4 个子网需要借 2 位主机位（2² = 4），主机位剩 6 位，子网掩码为 255.255.255.192（/26）。<br>' +
    '各子网网络地址：192.168.1.0、192.168.1.64、192.168.1.128、192.168.1.192；<br>' +
    '可用主机范围分别为 .1～.62、.65～.126、.129～.190、.193～.254，广播地址分别为 .63、.127、.191、.255。</p>',
    { tags: ['操作', '子网划分'] })
);

/* ---------------- 二级 MS Office ---------------- */
questions.push(
  q('MSOFFICE', 'single',
    '<p>在 Excel 中，表示绝对引用单元格 A1 的写法是（　　）。</p>',
    opt('A1', 'A$1', '$A$1', '$A1'), 'C',
    '<p><code>$</code> 加在行号或列标前表示绝对引用；<code>$A$1</code> 的行和列都被锁定，复制公式时不会改变。</p>',
    { tags: ['单选', 'Excel'] }),

  q('MSOFFICE', 'single',
    '<p>在 Excel 中，计算 A1 到 A10 单元格之和的正确公式是（　　）。</p>',
    opt('=SUM(A1:A10)', '=SUM(A1,A10)', '=ADD(A1:A10)', '=TOTAL(A1:A10)'), 'A',
    '<p>SUM 函数对区域求和，冒号表示连续区域 <code>A1:A10</code>；逗号表示多个不连续参数。</p>',
    { tags: ['单选', 'Excel'] }),

  q('MSOFFICE', 'single',
    '<p>PowerPoint 演示文稿的默认文件扩展名是（　　）。</p>',
    opt('.docx', '.xlsx', '.pptx', '.pdf'), 'C',
    '<p>.docx 是 Word 文档，.xlsx 是 Excel 工作簿，.pptx 是 PowerPoint 演示文稿。</p>',
    { tags: ['单选', 'PPT'] }),

  q('MSOFFICE', 'single',
    '<p>在 Word 中，为文档添加页眉和页脚，应使用（　　）选项卡。</p>',
    opt('插入', '开始', '视图', '审阅'), 'A',
    '<p>「插入」选项卡中有页眉、页脚、页码等命令；「视图」选项卡用于切换视图模式。</p>',
    { tags: ['单选', 'Word'] }),

  q('MSOFFICE', 'multi',
    '<p>下列 Excel 函数中，属于统计类函数的有（　　）。</p>',
    opt('SUM', 'AVERAGE', 'COUNT', 'VLOOKUP'), 'ABC',
    '<p>SUM 求和、AVERAGE 求平均值、COUNT 统计数值个数，都属于统计计算；VLOOKUP 是查找与引用函数。</p>',
    { tags: ['多选', 'Excel'] }),

  q('MSOFFICE', 'judge',
    '<p>在 Excel 中，单元格地址 A1 属于相对引用。</p>',
    [], '对',
    '<p>未加 <code>$</code> 的行号和列标都是相对的，公式复制到其他单元格时引用会随位置变化。</p>',
    { tags: ['判断', 'Excel'] }),

  q('MSOFFICE', 'fill',
    '<p>在 Excel 中，计算一组数据平均值的函数是 ________。</p>',
    [], 'AVERAGE',
    '<p>AVERAGE(number1, [number2], …) 返回参数的算术平均值，忽略文本和空单元格。</p>',
    { tags: ['填空', 'Excel'] }),

  q('MSOFFICE', 'single',
    '<p>在 PowerPoint 中，从第一张幻灯片开始放映的快捷键是（　　）。</p>',
    opt('F5', 'Shift+F5', 'Ctrl+F5', 'Alt+F5'), 'A',
    '<p>F5 从头开始放映；Shift+F5 从当前幻灯片开始放映。</p>',
    { tags: ['单选', 'PPT'] }),

  q('MSOFFICE', 'single',
    '<p>Word 中的「另存为」命令（　　）。</p>',
    opt('只能修改文件名', '可以修改保存位置和文件格式', '只能修改文件格式', '不能修改任何内容'), 'B',
    '<p>「另存为」可以重新选择保存位置、文件名以及文件类型（如 .docx、.pdf）。</p>',
    { tags: ['单选', 'Word'] }),

  q('MSOFFICE', 'single',
    '<p>在 Excel 单元格中输入公式时，必须以（　　）开头。</p>',
    opt('=', '+', '#', '@'), 'A',
    '<p>Excel 公式以等号 <code>=</code> 开头；以 <code>+</code> 开头会被当作普通文本或数值输入处理。</p>',
    { tags: ['单选', 'Excel'] })
);

const bank = {
  meta: {
    title: '计算机等级考试题库（示例）',
    updated: '2026-11-09',
    subjects: SUBJECTS
  },
  questions
};

const ids = new Set();
for (const item of questions) {
  if (!item.id || !item.subject || !item.stem) throw new Error('题目字段缺失：' + item.id);
  if (ids.has(item.id)) throw new Error('题目 id 重复：' + item.id);
  ids.add(item.id);
  if (!item.answer) throw new Error('题目缺少答案：' + item.id);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(bank, null, 2) + '\n', 'utf8');

const byType = {};
const bySubject = {};
for (const item of questions) {
  byType[item.type] = (byType[item.type] || 0) + 1;
  bySubject[item.subject] = (bySubject[item.subject] || 0) + 1;
}
console.log('已写入 ' + path.relative(ROOT, OUT));
console.log('题目总数：' + questions.length);
console.log('题型分布：' + JSON.stringify(byType));
console.log('科目分布：' + JSON.stringify(bySubject));
console.log('文件大小：' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');
