---
weight: 2
title: '2. 套接字和模式'
type: docs
---

# 第 2 章 - 套接字和模式 {#sockets-and-patterns}

在 [第 1 章 - 基础](chapter1#basics) 中，我们试驾了 ZeroMQ，展示了 ZeroMQ 主要模式的一些基本示例：请求 - 回复、发布 - 订阅和管道。在本章中，我们将动手学习如何将这些工具用于实际程序中。

我们将涵盖：

* 如何创建和使用 ZeroMQ 套接字。
* 如何在套接字上发送和接收消息。
* 如何围绕 ZeroMQ 的异步 I/O 模型构建应用程序。
* 如何在一个线程中处理多个套接字。
* 如何正确处理致命和非致命错误。
* 如何处理 Ctrl-C 等中断信号。
* 如何干净地关闭 ZeroMQ 应用程序。
* 如何检查 ZeroMQ 应用程序的内存泄漏。
* 如何发送和接收多部分消息。
* 如何在网络中转发消息。
* 如何构建简单的消息队列代理。
* 如何用 ZeroMQ 编写多线程应用程序。
* 如何使用 ZeroMQ 在线程间进行信号传递。
* 如何使用 ZeroMQ 协调网络中的节点。
* 如何创建和使用发布 - 订阅的消息信封。
* 使用 HWM（高水位标记）来防止内存溢出。

## 套接字 API {#The-Socket-API}

坦率地说，ZeroMQ 对你做了一种切换和诱骗，对此我们不道歉。这是为了你好，而且对我们的伤害比对你的伤害更大。ZeroMQ 提供了一个熟悉的基于套接字的 API，这需要我们付出巨大努力来隐藏一堆消息处理引擎。然而，结果会慢慢改变你对如何设计和编写分布式软件的世界观。

套接字是网络编程的事实标准 API，同时也是防止你的眼睛掉到脸颊上的有用工具。ZeroMQ 让开发者特别喜欢的一点是，它使用套接字和消息，而不是其他任意概念集。感谢 Martin Sustrik 成功实现了这一点。它将"面向消息的中间件"，这个保证让整个房间进入昏迷状态的短语，变成了"超辣套接字！"，这让我们产生了对披萨的奇怪渴望，并想要了解更多。

就像一个最喜欢的菜肴，ZeroMQ 套接字易于消化。套接字有四个部分的生命周期，就像 BSD 套接字一样：

* 创建和销毁套接字，它们共同构成套接字生命的业力循环（参见<tt>[zmq_socket()](http://api.zeromq.org/master:zmq_socket)</tt>、<tt>[zmq_close()](http://api.zeromq.org/master:zmq_close)</tt>）。

* 通过设置选项来配置套接字，并在必要时检查它们（参见<tt>[zmq_setsockopt()](http://api.zeromq.org/master:zmq_setsockopt)</tt>、<tt>[zmq_getsockopt()](http://api.zeromq.org/master:zmq_getsockopt)</tt>）。

* 通过创建 ZeroMQ 连接到套接字，将套接字插入网络拓扑（参见<tt>[zmq_bind()](http://api.zeromq.org/master:zmq_bind)</tt>、<tt>[zmq_connect()](http://api.zeromq.org/master:zmq_connect)</tt>）。

* 通过在套接字上写入和接收消息来使用套接字传输数据（参见<tt>[zmq_msg_send()](http://api.zeromq.org/master:zmq_msg_send)</tt>、<tt>[zmq_msg_recv()](http://api.zeromq.org/master:zmq_msg_recv)</tt>）。

请注意，套接字总是 void 指针，而消息（我们很快就会讲到）是结构体。所以在 C 中，你按原样传递套接字，但在所有处理消息的函数中，你传递消息的地址，比如<tt>[zmq_msg_send()](http://api.zeromq.org/master:zmq_msg_send)</tt>和<tt>[zmq_msg_recv()](http://api.zeromq.org/master:zmq_msg_recv)</tt>。作为一个记忆方法，要意识到"在 ZeroMQ 中，你所有的套接字都属于我们"，但消息是你代码中实际拥有的东西。

创建、销毁和配置套接字的工作方式与你对任何对象的期望一样。但请记住，ZeroMQ 是一个异步的、有弹性的框架。这对我们如何将套接字插入网络拓扑以及之后如何使用套接字有一些影响。

### 将套接字插入拓扑 {#Plugging-Sockets-into-the-Topology}

要在两个节点之间创建连接，你在一个节点中使用<tt>[zmq_bind()](http://api.zeromq.org/master:zmq_bind)</tt>，在另一个节点中使用<tt>[zmq_connect()](http://api.zeromq.org/master:zmq_connect)</tt>。作为一般经验法则，执行<tt>[zmq_bind()](http://api.zeromq.org/master:zmq_bind)</tt>的节点是"服务器"，位于众所周知的网络地址上，而执行<tt>[zmq_connect()](http://api.zeromq.org/master:zmq_connect)</tt>的节点是"客户端"，具有未知或任意的网络地址。因此，我们说我们将套接字"绑定到端点"和"将套接字连接到端点"，端点就是众所周知的网络地址。

ZeroMQ 连接与经典 TCP 连接有些不同。主要值得注意的区别是：

* 它们跨越任意传输（<tt>inproc</tt>、<tt>ipc</tt>、<tt>tcp</tt>、<tt>pgm</tt>或<tt>epgm</tt>）。参见<tt>[zmq_inproc()](http://api.zeromq.org/master:zmq_inproc)</tt>、<tt>[zmq_ipc()](http://api.zeromq.org/master:zmq_ipc)</tt>、<tt>[zmq_tcp()](http://api.zeromq.org/master:zmq_tcp)</tt>、<tt>[zmq_pgm()](http://api.zeromq.org/master:zmq_pgm)</tt>和<tt>[zmq_epgm()](http://api.zeromq.org/master:zmq_epgm)</tt>。

* 一个套接字可以有许多出站和许多入站连接。

* 没有<tt>zmq_accept</tt>() 方法。当套接字绑定到端点时，它会自动开始接受连接。

* 网络连接本身在后台进行，如果网络连接断开（例如，如果对等体消失然后回来），ZeroMQ 将自动重新连接。

* 你的应用程序代码不能直接处理这些连接；它们被封装在套接字下。

许多架构遵循某种客户端/服务器模型，其中服务器是最静态的组件，客户端是最动态的组件，即它们最常来来去去。有时存在寻址问题：服务器将对客户端可见，但反之则不一定。所以大多数情况下，哪个节点应该执行<tt>[zmq_bind()](http://api.zeromq.org/master:zmq_bind)</tt>（服务器）和哪个应该执行<tt>[zmq_connect()](http://api.zeromq.org/master:zmq_connect)</tt>（客户端）是显而易见的。这也取决于你使用的套接字类型，对于不寻常的网络架构有一些例外。我们稍后会查看套接字类型。

现在，想象一下我们在启动服务器*之前*启动客户端。在传统网络中，我们会得到一个大的红色失败标志。但 ZeroMQ 让我们可以任意启动和停止各个部分。一旦客户端节点执行<tt>[zmq_connect()](http://api.zeromq.org/master:zmq_connect)</tt>，连接就存在，该节点可以开始向套接字写入消息。在某个阶段（希望是在消息排队太多以至于开始被丢弃，或客户端阻塞之前），服务器启动，执行<tt>[zmq_bind()](http://api.zeromq.org/master:zmq_bind)</tt>，ZeroMQ 开始传递消息。

服务器节点可以绑定到许多端点（即协议和地址的组合），并且可以使用单个套接字完成此操作。这意味着它将接受跨不同传输的连接：

{{< fragment name="binding" >}}
zmq_bind (socket, "tcp://*:5555");
zmq_bind (socket, "tcp://*:9999");
zmq_bind (socket, "inproc://somename");
{{< /fragment >}}

对于大多数传输，你不能绑定到同一个端点两次，这与 UDP 不同。然而，<tt>ipc</tt>传输确实允许一个进程绑定到已经被第一个进程使用的端点。这是为了让进程在崩溃后能够恢复。

虽然 ZeroMQ 试图在绑定和连接方面保持中立，但存在差异。我们稍后会详细查看这些。结果是，你通常应该将"服务器"视为拓扑中更静态的部分，它们绑定到或多或少固定的端点，而"客户端"是动态的部分，它们来来去去并连接到这些端点。然后，围绕这个模型设计你的应用程序。它"正常工作"的可能性要大得多。

套接字有类型。套接字类型定义了套接字的语义，其向内和向外路由消息的策略，排队等。你可以连接某些类型的套接字，例如发布者套接字和订阅者套接字。套接字以"消息传递模式"协同工作。我们稍后会更详细地查看这一点。

能够以这些不同方式连接套接字赋予了 ZeroMQ 作为消息队列系统的基本能力。在此之上还有层，比如代理，我们稍后会讲到。但从本质上讲，使用 ZeroMQ，你通过像儿童构建玩具一样将部件插在一起来定义你的网络架构。

### 发送和接收消息 {#Sending-and-Receiving-Messages}

要发送和接收消息，你使用<tt>[zmq_msg_send()](http://api.zeromq.org/master:zmq_msg_send)</tt>和<tt>[zmq_msg_recv()](http://api.zeromq.org/master:zmq_msg_recv)</tt>方法。这些名称是传统的，但 ZeroMQ 的 I/O 模型与经典 TCP 模型足够不同，你需要时间来理解它。

{{< textdiagram name="fig9.png" figno="9" title="TCP sockets are 1 to 1" >}}
#------------#
|    Node    |
+------------+
|   Socket   |
'------------'
      ^
      |
      | 1 to 1
      |
      v
.------------.
|   Socket   |
+------------+
|    Node    |
#------------#
{{< /textdiagram >}}

让我们看看 TCP 套接字和 ZeroMQ 套接字在处理数据时的主要区别：

* ZeroMQ 套接字携带消息，像 UDP 一样，而不是像 TCP 那样的字节流。ZeroMQ 消息是长度指定的二进制数据。我们很快会讲到消息；它们的设计针对性能进行了优化，所以有点棘手。

* ZeroMQ 套接字在后台线程中进行 I/O。这意味着消息到达本地输入队列并从本地输出队列发送，无论你的应用程序忙于做什么。

* ZeroMQ 套接字具有内置的一对多路由行为，根据套接字类型而定。

<tt>[zmq_send()](http://api.zeromq.org/master:zmq_send)</tt>方法实际上并不将消息发送到套接字连接。它将消息排队，以便 I/O 线程可以异步发送它。除了一些异常情况外，它不会阻塞。因此，当<tt>[zmq_send()](http://api.zeromq.org/master:zmq_send)</tt>返回到你的应用程序时，消息不一定已经发送。

### 单播传输 {#Unicast-Transports}

ZeroMQ 提供了一组单播传输（<tt>inproc</tt>、<tt>ipc</tt>和<tt>tcp</tt>）和多播传输（epgm、pgm）。多播是一种高级技术，我们稍后会讲到。除非你知道你的扇出比率会使 1 对 N 单播不可能，否则甚至不要开始使用它。

对于大多数常见情况，使用**<tt>tcp</tt>**，这是一个*断开连接的 TCP*传输。它是有弹性的、可移植的，并且对于大多数情况来说足够快。我们称之为断开连接，因为 ZeroMQ 的<tt>tcp</tt>传输不要求在你连接到端点之前端点存在。客户端和服务器可以在任何时间连接和绑定，可以来来去去，它对应用程序保持透明。

进程间<tt>ipc</tt>传输像<tt>tcp</tt>一样是断开的。它有一个限制：它还不能在 Windows 上工作。按照惯例，我们使用带有".ipc"扩展名的端点名称，以避免与其他文件名潜在冲突。在 UNIX 系统上，如果你使用<tt>ipc</tt>端点，你需要用适当的权限创建这些端点，否则它们可能无法在运行在不同用户 ID 下的进程之间共享。你还必须确保所有进程都能访问这些文件，例如，通过在同一个工作目录中运行。

线程间传输，**<tt>inproc</tt>**，是一个已连接的信令传输。它比<tt>tcp</tt>或<tt>ipc</tt>快得多。这种传输相比<tt>tcp</tt>和<tt>ipc</tt>有一个特定限制：**服务器必须在任何客户端发出连接之前发出绑定**。这在 ZeroMQ v4.0 及更高版本中被修复了。

### ZeroMQ 不是中性载体 {#ZeroMQ-is-Not-a-Neutral-Carrier}

ZeroMQ 新手经常问的一个问题是（我自己也问过），"我如何在 ZeroMQ 中编写 XYZ 服务器？"例如，"我如何在 ZeroMQ 中编写 HTTP 服务器？"其含义是，如果我们使用普通套接字来携带 HTTP 请求和响应，我们应该能够使用 ZeroMQ 套接字做同样的事情，只是更快更好。

答案曾经是"这不是它的工作方式"。ZeroMQ 不是一个中性载体：它在它使用的传输协议上强加了一个框架。这个框架与现有协议不兼容，这些协议倾向于使用它们自己的框架。例如，比较 HTTP 请求和 ZeroMQ 请求，两者都通过 TCP/IP。

{{< textdiagram name="fig10.png" figno="10" title="HTTP on the Wire" >}}
#----------------+----+----+----+----#
| GET /index.html| 13 | 10 | 13 | 10 |
#----------------+----+----+----+----#
{{< /textdiagram >}}

HTTP 请求使用 CR-LF 作为其最简单的框架分隔符，而 ZeroMQ 使用长度指定的帧。所以你可以使用 ZeroMQ 编写类似 HTTP 的协议，例如使用请求 - 回复套接字模式。但它不会是 HTTP。

{{< textdiagram name="fig11.png" figno="11" title="ZeroMQ on the Wire" >}}
#---+---+---+---+---+---#
| 5 | H | E | L | L | O |
#---+---+---+---+---+---#
{{< /textdiagram >}}

从 v3.3 开始，ZeroMQ 有一个名为<tt>ZMQ_ROUTER_RAW</tt>的套接字选项，让你可以在没有 ZeroMQ 框架的情况下读写数据。你可以使用它来从 ZeroMQ 应用程序连接到 Telnet 服务器。在撰写本文时，这仍然有些实验性，但它展示了 ZeroMQ 如何不断发展以解决新问题。也许下一个补丁就是你的。

### I/O 线程 {#I-O-Threads}

我们说过 ZeroMQ 在后台线程中进行 I/O。一个 I/O 线程（适用于所有套接字）对于大多数但不是最极端的应用程序来说已经足够了。当你创建一个新上下文时，它从一个 I/O 线程开始。一般的经验法则是允许每个千兆字节每秒入或出的数据有一个 I/O 线程。要增加 I/O 线程的数量，使用<tt>[zmq_ctx_set()](http://api.zeromq.org/master:zmq_ctx_set)</tt>调用，在创建任何套接字*之前*：

{{< fragment name="iothreads" >}}
int io_threads = 4;
void *context = zmq_ctx_new ();
zmq_ctx_set (context, ZMQ_IO_THREADS, io_threads);
assert (zmq_ctx_get (context, ZMQ_IO_THREADS) == io_threads);
{{< /fragment >}}

我们已经看到一个套接字可以同时处理数十个甚至数千个连接。这对我们如何编写应用程序产生了根本性影响。传统的网络应用程序为每个远程连接都有一个进程或一个线程，并且该进程或线程处理一个套接字。ZeroMQ 让你可以将整个结构折叠成一个进程，然后根据需要进行分解以进行扩展。

如果你仅将 ZeroMQ 用于进程间通信（即，不进行外部套接字 I/O 的多线程应用程序），你可以将 I/O 线程设置为零。这不是一个重要的优化，更多的是一个好奇心。

## 消息传递模式 {#Messaging-Patterns}

在 ZeroMQ 套接字 API 的棕色纸包装之下，是消息传递模式的世界。如果你有企业消息传递的背景，或者对 UDP 很了解，这些可能会隐约熟悉。但对大多数 ZeroMQ 新手来说，它们是一个惊喜。我们如此习惯于 TCP 范式，即套接字与另一个节点一对一映射。

让我们简要回顾一下 ZeroMQ 为你做了什么。它将数据块（消息）快速高效地传递给节点。你可以将节点映射到线程、进程或节点。ZeroMQ 为你的应用程序提供了一个单一的套接字 API 来使用，无论实际的传输是什么（如进程内、进程间、TCP 或多播）。它会自动重新连接到对等体，因为它们来来去去。它在发送者和接收者处排队消息，根据需要。它限制这些队列以防止进程耗尽内存。它处理套接字错误。它在后台线程中进行所有 I/O。它在节点之间使用无锁技术进行通信，因此从来没有锁、等待、信号量或死锁。

但贯穿其中，它根据称为*模式*的精确配方来路由和排队消息。正是这些模式提供了 ZeroMQ 的智能。它们封装了我们来之不易的关于分发数据和工作最佳方式的经验。ZeroMQ 的模式是硬编码的，但未来版本可能允许用户定义的模式。

ZeroMQ 模式由成对的套接字与匹配的类型实现。换句话说，要理解 ZeroMQ 模式，你需要理解套接字类型以及它们如何协同工作。大多数情况下，这只需要学习；在这个层面上很少有显而易见的东西。

内置的核心 ZeroMQ 模式有：

* **请求 - 回复**，它将一组客户端连接到一组服务。这是一种远程过程调用和任务分发模式。

* **发布 - 订阅**，它将一组发布者连接到一组订阅者。这是一种数据分发模式。

* **管道**，它以扇出/扇入模式连接节点，可以有多个步骤和循环。这是一种并行任务分发和收集模式。

* **独占对**，它专门连接两个套接字。这是一种连接进程中两个线程的模式，不要与"普通"套接字对混淆。

我们在 [第 1 章 - 基础](chapter1#basics) 中查看了前三个，稍后在本章中我们会看到独占对模式。<tt>[zmq_socket()](http://api.zeromq.org/master:zmq_socket)</tt>手册页清楚地说明了这些模式——值得多读几遍，直到它开始有意义。这些是连接 - 绑定对有效的套接字组合（任何一方都可以绑定）：

* PUB 和 SUB
* REQ 和 REP
* REQ 和 ROUTER（小心，REQ 插入一个额外的空帧）
* DEALER 和 REP（小心，REP 假设有一个空帧）
* DEALER 和 ROUTER
* DEALER 和 DEALER
* ROUTER 和 ROUTER
* PUSH 和 PULL
* PAIR 和 PAIR

你还会看到对 XPUB 和 XSUB 套接字的引用，我们稍后会讲到（它们就像 PUB 和 SUB 的原始版本）。任何其他组合都会产生未记录和不可靠的结果，未来版本的 ZeroMQ 可能会在你尝试它们时返回错误。你可以而且将会通过代码桥接其他套接字类型，即从一种套接字类型读取并写入另一种。

### 高级消息传递模式 {#High-Level-Messaging-Patterns}

这四个核心模式被编入 ZeroMQ。它们是 ZeroMQ API 的一部分，在核心 C++ 库中实现，并保证在所有精品零售店都有售。

在这些之上，我们添加*高级消息传递模式*。我们在 ZeroMQ 之上构建这些高级模式，并用我们正在使用的任何语言实现它们。它们不是核心库的一部分，不与 ZeroMQ 包一起提供，而是作为 ZeroMQ 社区的一部分存在于它们自己的空间中。例如，Majordomo 模式，我们在 [第 4 章 - 可靠的请求 - 回复模式](chapter4#reliable-request-reply) 中探讨，位于 ZeroMQ 组织的 GitHub Majordomo 项目中。

我们在本书中旨在为你提供一组这样的高级模式，既有小的（如何理智地处理消息）也有大的（如何制作可靠的发布 - 订阅架构）。

### 处理消息 {#Working-with-Messages}

<tt>libzmq</tt>核心库实际上有两个 API 来发送和接收消息。我们已经看到并使用的<tt>[zmq_send()](http://api.zeromq.org/master:zmq_send)</tt>和<tt>[zmq_recv()](http://api.zeromq.org/master:zmq_recv)</tt>方法是简单的一行程序。我们将经常使用这些，但<tt>[zmq_recv()](http://api.zeromq.org/master:zmq_recv)</tt>不擅长处理任意消息大小：它会将你提供的缓冲区大小的消息截断。所以还有第二个 API，使用 zmq_msg_t 结构，具有更丰富但更困难的 API：

* 初始化消息：<tt>[zmq_msg_init()](http://api.zeromq.org/master:zmq_msg_init)</tt>、<tt>[zmq_msg_init_size()](http://api.zeromq.org/master:zmq_msg_init_size)</tt>、<tt>[zmq_msg_init_data()](http://api.zeromq.org/master:zmq_msg_init_data)</tt>。
* 发送和接收消息：<tt>[zmq_msg_send()](http://api.zeromq.org/master:zmq_msg_send)</tt>、<tt>[zmq_msg_recv()](http://api.zeromq.org/master:zmq_msg_recv)</tt>。
* 释放消息：<tt>[zmq_msg_close()](http://api.zeromq.org/master:zmq_msg_close)</tt>。
* 访问消息内容：<tt>[zmq_msg_data()](http://api.zeromq.org/master:zmq_msg_data)</tt>、<tt>[zmq_msg_size()](http://api.zeromq.org/master:zmq_msg_size)</tt>、<tt>[zmq_msg_more()](http://api.zeromq.org/master:zmq_msg_more)</tt>。
* 处理消息属性：<tt>[zmq_msg_get()](http://api.zeromq.org/master:zmq_msg_get)</tt>、<tt>[zmq_msg_set()](http://api.zeromq.org/master:zmq_msg_set)</tt>。
* 消息操作：<tt>[zmq_msg_copy()](http://api.zeromq.org/master:zmq_msg_copy)</tt>、<tt>[zmq_msg_move()](http://api.zeromq.org/master:zmq_msg_move)</tt>。

在网络上，ZeroMQ 消息是从零开始向上任何大小的二进制数据块，适合内存。你使用协议缓冲区、msgpack、JSON 或你的应用程序需要说的任何其他东西来做自己的序列化。选择可移植的数据表示是明智的，但你可以自己决定权衡。

在内存中，ZeroMQ 消息是<tt>zmq_msg_t</tt>结构（或类，取决于你的语言）。以下是使用 ZeroMQ 消息的基本规则：

* 你创建和传递<tt>zmq_msg_t</tt>对象，而不是数据块。

* 要读取消息，你使用<tt>[zmq_msg_init()](http://api.zeromq.org/master:zmq_msg_init)</tt>创建一个空消息，然后将其传递给<tt>[zmq_msg_recv()](http://api.zeromq.org/master:zmq_msg_recv)</tt>。

* 要从新数据写入消息，你使用<tt>[zmq_msg_init_size()](http://api.zeromq.org/master:zmq_msg_init_size)</tt>创建消息，同时分配一些大小的数据块。然后使用<tt>memcpy</tt>填充该数据，并将消息传递给<tt>[zmq_msg_send()](http://api.zeromq.org/master:zmq_msg_send)</tt>。

* 要释放（而不是销毁）消息，你调用<tt>[zmq_msg_close()](http://api.zeromq.org/master:zmq_msg_close)</tt>。这会删除一个引用，最终 ZeroMQ 会销毁该消息。

* 要访问消息内容，你使用<tt>[zmq_msg_data()](http://api.zeromq.org/master:zmq_msg_data)</tt>。要知道消息包含多少数据，使用<tt>[zmq_msg_size()](http://api.zeromq.org/master:zmq_msg_size)</tt>。

* 不要使用<tt>[zmq_msg_move()](http://api.zeromq.org/master:zmq_msg_move)</tt>、<tt>[zmq_msg_copy()](http://api.zeromq.org/master:zmq_msg_copy)</tt>或<tt>[zmq_msg_init_data()](http://api.zeromq.org/master:zmq_msg_init_data)</tt>，除非你阅读了手册页并确切知道为什么需要这些。

* 在你将消息传递给<tt>[zmq_msg_send()](http://api.zeromq.org/master:zmq_msg_send)</tt>后，ØMQ 会清除消息，即将大小设置为零。你不能两次发送相同的消息，发送后也不能访问消息数据。

* 如果你使用<tt>[zmq_send()](http://api.zeromq.org/master:zmq_send)</tt>和<tt>[zmq_recv()](http://api.zeromq.org/master:zmq_recv)</tt>，这些规则不适用，你传递的是字节数组，而不是消息结构。

如果你想发送相同的消息多次，而且它很大，创建第二个消息，使用<tt>[zmq_msg_init()](http://api.zeromq.org/master:zmq_msg_init)</tt>初始化它，然后使用<tt>[zmq_msg_copy()](http://api.zeromq.org/master:zmq_msg_copy)</tt>创建第一个消息的副本。这不会复制数据，而是复制引用。然后你可以发送消息两次（或更多，如果你创建更多副本），只有当最后一个副本被发送或关闭时，消息才会最终被销毁。

ZeroMQ 还支持*多部分*消息，它让你可以将一个列表的帧作为单个网络消息发送或接收。这在实际应用中被广泛使用，既用于用地址信息包装消息，也用于简单序列化。我们稍后会看到回复信封。

我们现在要学习的只是如何在任何需要转发消息而不检查它们的应用程序（如代理）中盲目且安全地读取和写入多部分消息。

当你处理多部分消息时，每个部分都是一个<tt>zmq_msg</tt>项目。例如，如果你要发送一个包含五个部分的消息，你必须构造、发送和销毁五个<tt>zmq_msg</tt>项目。你可以提前这样做（并将<tt>zmq_msg</tt>项目存储在数组或其他结构中），或者在发送它们时逐个进行。

以下是我们如何发送多部分消息中的帧（我们将每个帧接收到消息对象中）：

{{< fragment name="sendmore" >}}
zmq_msg_send (&message, socket, ZMQ_SNDMORE);
...
zmq_msg_send (&message, socket, ZMQ_SNDMORE);
...
zmq_msg_send (&message, socket, 0);
{{< /fragment >}}

以下是我们如何接收和处理消息中的所有部分，无论是单部分还是多部分：

{{< fragment name="recvmore" >}}
while (1) {
    zmq_msg_t message;
    zmq_msg_init (&message);
    zmq_msg_recv (&message, socket, 0);
    //  处理消息帧
    ...
    zmq_msg_close (&message);
    if (!zmq_msg_more (&message))
        break;      //  最后消息帧
}
{{< /fragment >}}

关于多部分消息需要知道的一些事情：

* 当你发送多部分消息时，第一部分（和所有后续部分）只有在你发送最后一部分时才会实际在网络上发送。
* 如果你使用<tt>[zmq_poll()](http://api.zeromq.org/master:zmq_poll)</tt>，当你接收消息的第一部分时，所有其余部分也已经到达。
* 你将接收消息的所有部分，或者一个也不接收。
* 消息的每个部分都是一个单独的<tt>zmq_msg</tt>项目。
* 无论你是否检查更多属性，你都会接收消息的所有部分。
* 在发送时，ZeroMQ 在内存中排队消息帧，直到收到最后一个，然后一次性发送它们。
* 没有办法取消部分发送的消息，除非关闭套接字。

### 处理多个套接字 {#Handling-Multiple-Sockets}

在我们迄今为止的所有示例中，大多数示例的主循环都是：

1. 等待套接字上的消息。
1. 处理消息。
1. 重复。

如果我们想同时从多个端点读取数据怎么办？最简单的方法是将一个套接字连接到所有端点，让 ZeroMQ 为我们做扇入。如果远程端点处于相同的模式，这是合法的，但将 PULL 套接字连接到 PUB 端点将是错误的。

要真正同时从多个套接字读取，使用<tt>[zmq_poll()](http://api.zeromq.org/master:zmq_poll)</tt>。一个更好的方法可能是将<tt>[zmq_poll()](http://api.zeromq.org/master:zmq_poll)</tt>包装在一个框架中，将其变成一个漂亮的事件驱动*反应器*，但它比我们想在这里介绍的要复杂得多。

让我们从一个肮脏的黑客开始，部分是为了不做得正确的乐趣，但主要是因为它让我向你展示如何做非阻塞套接字读取。这是一个使用非阻塞读取从两个套接字读取的简单示例。这个相当混乱的程序既充当天气更新的订阅者，又充当并行任务的工作者：

{{< examples name="msreader" title="Multiple socket reader" >}}

这种方法的成本是第一消息的一些额外延迟（循环结束时没有等待消息要处理的睡眠）。这在亚毫秒级延迟至关重要的应用程序中会成为问题。另外，你需要检查 nanosleep() 或你使用的任何函数的文档，以确保它不会忙等待。

你可以通过先从一个套接字读取，然后从第二个套接字读取，而不是像我们在这个示例中那样优先考虑它们，来公平地对待这些套接字。

现在让我们看看使用<tt>[zmq_poll()](http://api.zeromq.org/master:zmq_poll)</tt>正确完成的同样无意义的小应用程序：

{{< examples name="mspoller" title="Multiple socket poller" >}}

items 结构有四个成员：

```C
typedef struct {
    void *socket;       //  ZeroMQ 套接字轮询
    int fd;             //  或者，要轮询的本机文件句柄
    short events;       //  轮询的事件
    short revents;      //  轮询后返回的事件
} zmq_pollitem_t;
```

### 多部分消息 {#Multipart-Messages}

ZeroMQ 让我们用几个帧组成一个消息，给我们一个"多部分消息"。实际应用程序大量使用多部分消息，既用于用地址信息包装消息，也用于简单序列化。我们稍后会查看回复信封。

我们现在要学习的只是如何在任何需要转发消息而不检查它们的应用程序（如代理）中盲目且安全地读取和写入多部分消息。

当你处理多部分消息时，每个部分都是一个<tt>zmq_msg</tt>项目。例如，如果你要发送一个包含五个部分的消息，你必须构造、发送和销毁五个<tt>zmq_msg</tt>项目。你可以提前这样做（并将<tt>zmq_msg</tt>项目存储在数组或其他结构中），或者在发送它们时逐个进行。

以下是我们如何发送多部分消息中的帧（我们将每个帧接收到消息对象中）：

{{< fragment name="sendmore" >}}
zmq_msg_send (&message, socket, ZMQ_SNDMORE);
...
zmq_msg_send (&message, socket, ZMQ_SNDMORE);
...
zmq_msg_send (&message, socket, 0);
{{< /fragment >}}

以下是我们如何接收和处理消息中的所有部分，无论是单部分还是多部分：

{{< fragment name="recvmore" >}}
while (1) {
    zmq_msg_t message;
    zmq_msg_init (&message);
    zmq_msg_recv (&message, socket, 0);
    //  处理消息帧
    ...
    zmq_msg_close (&message);
    if (!zmq_msg_more (&message))
        break;      //  最后消息帧
}
{{< /fragment >}}

关于多部分消息需要知道的一些事情：

* 当你发送多部分消息时，第一部分（和所有后续部分）只有在你发送最后一部分时才会实际在网络上发送。
* 如果你使用<tt>[zmq_poll()](http://api.zeromq.org/master:zmq_poll)</tt>，当你接收消息的第一部分时，所有其余部分也已经到达。
* 你将接收消息的所有部分，或者一个也不接收。
* 消息的每个部分都是一个单独的<tt>zmq_msg</tt>项目。
* 无论你是否检查更多属性，你都会接收消息的所有部分。
* 在发送时，ZeroMQ 在内存中排队消息帧，直到收到最后一个，然后一次性发送它们。
* 没有办法取消部分发送的消息，除非关闭套接字。

### 中介和代理 {#Intermediaries-and-Proxies}

ZeroMQ 旨在实现分布式智能，但这并不意味着你的网络中间是空旷的空间。它充满了消息感知的基础设施，而且相当经常，我们用 ZeroMQ 构建这个基础设施。ZeroMQ 管道可以从微小的管道到完整的面向服务的代理。消息传递行业称之为*中介*，意味着中间的东西处理任何一方。在 ZeroMQ 中，我们根据上下文称这些为代理、队列、转发器、设备或代理。

这种模式在现实世界中极其常见，这就是为什么我们的社会和经济充满了中介，他们没有其他真正的功能，只是降低大型网络的复杂性和扩展成本。现实世界的中介通常被称为批发商、分销商、经理等等。

### 动态发现问题 {#The-Dynamic-Discovery-Problem}

当你设计更大的分布式架构时，你会遇到的一个问题之一是发现。也就是说，各个部分如何相互了解？如果部分来来去去，这就特别困难，所以我们称之为"动态发现问题"。

动态发现有几种解决方案。最简单的是完全避免它，通过硬编码（或配置）网络架构，以便手动完成发现。也就是说，当你添加一个新部分时，你重新配置网络以了解它。

{{< textdiagram name="fig12.png" figno="12" title="Small-Scale Pub-Sub Network" >}}
                 #-----------#
                 | Publisher |
                 +-----------+
                 |    PUB    |
                 '-----------'
                     bind
           tcp://192.168.55.210:5556
                       |
                       |
      .----------------+----------------.
      |                |                |
      |                |                |
   connect           connect          connect
.------------.   .------------.   .------------.
|    SUB     |   |    SUB     |   |    SUB     |
+------------+   +------------+   +------------+
| Subscriber |   | Subscriber |   | Subscriber |
#------------#   #------------#   #------------#
{{< /textdiagram >}}

在实践中，这导致越来越脆弱和笨拙的架构。假设你有一个发布者和一百个订阅者。你将每个订阅者连接到发布者，通过在每个订阅者中配置发布者端点。这很容易。订阅者是动态的；发布者是静态的。现在假设你添加更多发布者。突然，这不再那么容易了。如果你继续将每个订阅者连接到每个发布者，避免动态发现的成本会越来越高。

{{< textdiagram name="fig13.png" figno="13" title="Pub-Sub Network with a Proxy" >}}
#------------#   #------------#   #------------#
| Publisher  |   | Publisher  |   | Publisher  |
+------------+   +------------+   +------------+
|    PUB     |   |    PUB     |   |    PUB     |
'------------'   '------------'   '------------'
   connect          connect          connect
      |                |                |
      '----------------+----------------'
                       |
                      bind
                 .------------.
                 |    XSUB    |
                 +------------+
                 |   Proxy    |
                 +------------+
                 |    XPUB    |
                 '------------'
                      bind
                       |
      .----------------+----------------.
      |                |                |
   connect           connect          connect
.------------.   .------------.   .------------.
|    SUB     |   |    SUB     |   |    SUB     |
+------------+   +------------+   +------------+
| Subscriber |   | Subscriber |   | Subscriber |
#------------#   #------------#   #------------#
{{< /textdiagram >}}

对此有很多答案，但最简单的答案是添加一个中介；也就是说，网络中的一个静态点，所有其他节点都连接到它。在经典消息传递中，这是消息代理的工作。ZeroMQ 本身并不带消息代理，但它让我们很容易构建中介。

你可能想知道，如果所有网络最终都大到需要中介，为什么我们不为所有应用程序简单地放置一个消息代理？对初学者来说，这是一个公平的妥协。总是使用星形拓扑，忘记性能，事情通常会奏效。然而，消息代理是贪婪的东西；在它们作为中央中介的角色中，它们变得太复杂、太有状态，最终成为问题。

最好将中介视为简单的无状态消息交换机。一个好的类比是 HTTP 代理；它在那里，但没有特殊角色。添加发布 - 订阅代理解决了我们示例中的动态发现问题。我们将代理设置在网络的"中间"。代理打开一个 XSUB 套接字，一个 XPUB 套接字，并将每个绑定到众所周知的 IP 地址和端口。然后，所有其他进程都连接到代理，而不是彼此。添加更多订阅者或发布者变得轻而易举。

{{< textdiagram name="fig14.png" figno="14" title="Extended Pub-Sub" >}}
#---------#   #---------#   #---------#
|   PUB   |   |   PUB   |   |   PUB   |
'----+----'   '----+----'   '----+----'
     |             |             |
     '-------------+-------------'
                   |
             .-----+-----.
             |   XSUB    |
             +-----------+
             |   code    |
             +-----------+
             |   XPUB    |
             '-----+-----'
                   |
     .-------------+-------------.
     |             |             |
.----+----.   .----+----.   .----+----.
|   SUB   |   |   SUB   |   |   SUB   |
#---------#   #---------#   #---------#
{{< /textdiagram >}}

我们需要 XPUB 和 XSUB 套接字，因为 ZeroMQ 将订阅从订阅者转发到发布者。XSUB 和 XPUB 与 SUB 和 PUB 完全一样，只是它们将订阅作为特殊消息公开。代理必须通过在 XPUB 套接字上读取它们并在 XSUB 套接字上写入它们，将这些订阅消息从订阅者端转发到发布者端。这是 XSUB 和 XPUB 的主要用例。

### 共享队列（DEALER 和 ROUTER 套接字） {#Shared-Queue-DEALER-and-ROUTER-sockets}

在 Hello World 客户端/服务器应用程序中，我们有一个客户端与一个服务对话。然而，在实际情况下，我们通常需要允许多个服务以及多个客户端。这让我们能够扩展服务的功能（许多线程或进程或节点，而不仅仅是一个）。唯一的约束是服务必须是无状态的，所有状态都在请求中或某些共享存储（如数据库）中。

{{< textdiagram name="fig15.png" figno="15" title="Request Distribution" >}}
             #-----------#
             |  Client   |
             +-----------+
             |    REQ    |
             '-----+-----'
                   |
            R1, R2,| R3, R4
                   |
     .-------------+-------------.
     |             |             |
 R1, | R4          | R2          | R3
     |             |             |
     v             v             v
.---------.   .---------.   .---------.
|   REP   |   |   REP   |   |   REP   |
+---------+   +---------+   +---------+
| Service |   | Service |   | Service |
|    A    |   |    B    |   |    C    |
#---------#   #---------#   #---------#
{{< /textdiagram >}}

有两种方法可以连接多个客户端到多个服务器。蛮力方法是将每个客户端套接字连接到多个服务端点。一个客户端套接字可以连接到多个服务套接字，然后 REQ 套接字将在这些服务之间分发请求。假设你将客户端套接字连接到三个服务端点；A、B 和 C。客户端发出请求 R1、R2、R3、R4。R1 和 R4 转到服务 A，R2 转到 B，R3 转到服务 C。

这种设计让你可以廉价地添加更多客户端。你也可以添加更多服务。每个客户端都会将请求分发给服务。但每个客户端都必须了解服务拓扑。如果你有 100 个客户端，然后决定添加三个更多服务，你需要重新配置并重新启动 100 个客户端，以便客户端了解三个新服务。

这显然不是我们在凌晨 3 点想要做的事情，当我们的超级计算集群已经耗尽资源，我们迫切需要添加几百个新服务节点时。太多的静态部件就像液体混凝土：知识是分布式的，你拥有的静态部件越多，改变拓扑所需的努力就越多。我们想要的是坐在客户端和服务之间的东西，集中所有拓扑知识。理想情况下，我们应该能够在任何时候添加和删除服务或客户端，而不触及拓扑的任何其他部分。

因此，我们将编写一个小的消息队列代理，为我们提供这种灵活性。代理绑定到两个端点，一个用于客户端连接的 frontend（前端套接字），一个用于工作连接的 backend（后端）。然后它使用<tt>[zmq_poll()](http://api.zeromq.org/master:zmq_poll)</tt>来监视这两个套接字的活动，当它有一些活动时，它在两个套接字之间来回传送消息。它实际上并不显式管理任何队列——ZeroMQ 在每个套接字上自动完成。

当你使用 REQ 与 REP 对话时，你会得到一个严格同步的请求 - 回复对话。客户端发送请求。服务读取请求并发送回复。客户端然后读取回复。如果客户端或服务尝试做任何其他事情（例如，在没有等待响应的情况下连续发送两个请求），它们将收到错误。

但我们的代理必须是非阻塞的。显然，我们可以使用<tt>[zmq_poll()](http://api.zeromq.org/master:zmq_poll)</tt>等待任一套接字的活动，但我们不能使用 REP 和 REQ。

{{< textdiagram name="fig16.png" figno="16" title="Extended Request-Reply" >}}
#---------#   #---------#   #---------#
|   REQ   |   |   REQ   |   |   REQ   |
'----+----'   '----+----'   '----+----'
     |             |             |
     '-------------+-------------'
                   |
             .-----+-----.
             |  ROUTER   |
             +-----------+
             |   code    |
             +-----------+
             |  DEALER   |
             '-----+-----'
                   |
     .-------------+-------------.
     |             |             |
     v             v             v
.---------.   .---------.   .---------.
|   REP   |   |   REP   |   |   REP   |
#---------#   #---------#   #---------#
{{< /textdiagram >}}

幸运的是，有两个名为 DEALER 和 ROUTER 的套接字让你可以进行非阻塞请求 - 响应。你将在 [第 3 章 - 高级请求 - 回复模式](chapter3#advanced-request-reply) 中看到 DEALER 和 ROUTER 套接字如何让你构建各种异步请求 - 回复流。现在，我们只是要看看 DEALER 和 ROUTER 如何让我们通过中介扩展 REQ-REP，即我们的小代理。

在这个简单的扩展请求 - 回复模式中，REQ 与 ROUTER 对话，DEALER 与 REP 对话。在 DEALER 和 ROUTER 之间，我们必须有代码（如我们的代理）从一个套接字上拉取消息并将它们推到另一个套接字上。

请求 - 回复代理绑定到两个端点，一个用于客户端连接的 frontend（前端），一个用于工作连接的 backend（后端）。为了测试这个代理，你需要更改你的工作程序，使它们连接到后端套接字。这里是一个客户端，展示了我的意思：

{{< examples name="rrclient" title="Request-reply client" >}}

这里是工作程序：

{{< examples name="rrworker" title="Request-reply worker" >}}

这里是代理，它正确处理多部分消息：

{{< examples name="rrbroker" title="Request-reply broker" >}}

{{< textdiagram name="fig17.png" figno="17" title="Request-Reply Broker" >}}
#---------#   #---------#   #---------#
| Client  |   | Client  |   | Client  |
+---------+   +---------+   +---------+
|   REQ   |   |   REQ   |   |   REQ   |
'----+----'   '----+----'   '----+----'
     |             |             |
     '-------------+-------------'
                   |
                   v
             .-----------.
             |  ROUTER   |
             +-----------+
             |  Broker   |
             +-----------+
             |  DEALER   |
             '-----+-----'
                   |
     .-------------+-------------.
     |             |             |
     v             v             v
.---------.   .---------.   .---------.
|   REP   |   |   REP   |   |   REP   |
+---------+   +---------+   +---------+
| Service |   | Service |   | Service |
|    A    |   |    B    |   |    C    |
#---------#   #---------#   #---------#
{{< /textdiagram >}}

使用请求 - 回复代理使你的客户端/服务器架构更容易扩展，因为客户端看不到工作程序，工作程序也看不到客户端。唯一的静态节点是中间的代理。

你可能想知道响应如何路由回正确的客户端。Router 使用消息的信封，其中包含有关客户端的信息，用于 dealer，dealer 响应将包括信封，该信封将用于将响应映射回客户端。

### ZeroMQ 的内置代理功能 {#ZeroMQ-s-Built-In-Proxy-Function}

事实证明，上一节中<tt>rrbroker</tt>的核心循环非常有用，而且可重用。它让我们可以用很少的努力构建发布 - 订阅转发器和共享队列以及其他小中介。ZeroMQ 将此包装在一个方法中，<tt>[zmq_proxy()](http://api.zeromq.org/master:zmq_proxy)</tt>：

{{< fragment name="proxy" >}}
zmq_proxy (frontend, backend, capture);
{{< /fragment >}}

这两个（或三个套接字，如果我们想要捕获数据）必须正确连接、绑定和配置。当我们调用<tt>zmq_proxy</tt>方法时，它就像启动<tt>rrbroker</tt>的主循环一样。让我们重写请求 - 回复代理以调用<tt>zmq_proxy</tt>，并将其重新命名为听起来昂贵的"消息队列"（人们曾为做得更少的代码收取房屋费用）：

{{< examples name="msgqueue" title="Message queue broker" >}}

如果你像大多数 ZeroMQ 用户一样，在这个阶段，你的大脑开始思考，"如果我将随机套接字类型插入代理，我能做什么样的邪恶事情？"简短的答案是：试试看，弄清楚发生了什么。在实践中，你通常会坚持使用 ROUTER/DEALER、XSUB/XPUB 或 PULL/PUSH。

### 传输桥接 {#Transport-Bridging}

ZeroMQ 用户经常提出的一个问题是，"我如何将我的 ZeroMQ 网络与技术 X 连接？"其中 X 是其他网络或消息传递技术。

{{< textdiagram name="fig18.png" figno="18" title="Pub-Sub Forwarder Proxy" >}}
               #-----------#
               | Publisher |
               +-----------+
               |    PUB    |
               '-----------'
                   bind
        tcp://192.168.55.210:5556
                    |
     .--------------+--------------.
     |              |              |
     v              v              v
.----------.   .----------.   .----------.
|   SUB    |   |   SUB    |   |   XSUB   |
+----------+   +----------+   +----------+
|Subscriber|   |Subscriber|   |  Proxy   |
#----------#   #----------#   +----------+
                              |   XPUB   |
                              '-----+----'
 Internal network                   |
====================================+=============
 External network                  bind
                           tcp://10.1.1.0:8100
                                    |
                            .-------+-------.
                            |               |
                            v               v
                       .----------.   .----------.
                       |   SUB    |   |   SUB    |
                       +----------+   +----------+
                       |Subscriber|   |Subscriber|
                       #----------#   #----------#
{{< /textdiagram >}}

简单的答案是构建一个*桥*。桥是一个小型应用程序，它在一个套接字上说一种协议，并在另一个套接字上转换为/从第二种协议。如果你喜欢，可以称之为协议解释器。ZeroMQ 中的一个常见桥接问题是桥接两个传输或网络。

作为一个例子，我们将编写一个坐在发布者和一组订阅者之间的小代理，桥接两个网络。前端套接字（SUB）面向内部网络，天气服务器坐在那里，后端（PUB）面向外部网络上的订阅者。它订阅前端套接字上的天气服务，并在后端套接字上重新发布其数据。

{{< examples name="wuproxy" title="Weather update proxy" >}}

它看起来非常类似于前面的代理示例，但关键部分是前端和后端套接字位于两个不同的网络上。我们可以使用这个模型，例如，将多播网络（<tt>pgm</tt>传输）连接到<tt>tcp</tt>发布者。

## 处理错误和 ETERM {#Handling-Errors-and-ETERM}

ZeroMQ 的错误处理哲学是快速失败和弹性的混合。我们相信，进程应该尽可能容易受到内部错误的影响，并且尽可能强大地抵御外部攻击和错误。打个比方，一个活细胞如果检测到单个内部错误就会自毁，但它会尽一切可能抵抗来自外部的攻击。

断言，点缀在 ZeroMQ 代码中，对强大的代码绝对至关重要；它们只需要在细胞壁的正确一侧。而且应该有这样的墙。如果不清楚故障是内部的还是外部的，那就是需要修复的设计缺陷。在 C/C++ 中，断言会立即停止应用程序并显示错误。在其他语言中，你可能会得到异常或停止。

当 ZeroMQ 检测到外部故障时，它会向调用代码返回错误。在一些罕见的情况下，如果没有明显的恢复策略，它会默默地丢弃消息。

在我们迄今为止看到的大多数 C 示例中，都没有错误处理。**真实代码应该在每个 ZeroMQ 调用上都进行错误处理**。如果你使用的是 C 以外的语言绑定，绑定可能会为你处理错误。在 C 中，你需要自己处理。有一些简单的规则，从 POSIX 约定开始：

* 创建对象的方法在失败时返回 NULL。
* 处理数据的方法可能返回处理的字节数，或在错误或失败时返回 -1。
* 其他方法在成功时返回 0，在错误或失败时返回 -1。
* 错误代码在<tt>errno</tt>或<tt>[zmq_errno()](http://api.zeromq.org/master:zmq_errno)</tt>中提供。
* 用于日志记录的描述性错误文本由<tt>[zmq_strerror()](http://api.zeromq.org/master:zmq_strerror)</tt>提供。

例如：

{{< fragment name="errorhandling" >}}
void *context = zmq_ctx_new ();
assert (context);
void *socket = zmq_socket (context, ZMQ_REP);
assert (socket);
int rc = zmq_bind (socket, "tcp://*:5555");
if (rc == -1) {
    printf ("E: bind failed: %s\n", strerror (errno));
    return -1;
}
{{< /fragment >}}

有两个主要的异常情况，你应该将其视为非致命：

* 当你的代码使用<tt>ZMQ_DONTWAIT</tt>选项接收消息并且没有等待数据时，ZeroMQ 将返回 -1 并将<tt>errno</tt>设置为<tt>EAGAIN</tt>。

* 当一个线程调用<tt>[zmq_ctx_destroy()](http://api.zeromq.org/master:zmq_ctx_destroy)</tt>，而其他线程仍在进行阻塞工作时，<tt>[zmq_ctx_destroy()](http://api.zeromq.org/master:zmq_ctx_destroy)</tt>调用关闭上下文，所有阻塞调用以 -1 退出，<tt>errno</tt>设置为<tt>ETERM</tt>。

在 C/C++ 中，断言可以在优化代码中完全删除，所以不要犯将整个 ZeroMQ 调用包装在<tt>assert()</tt>中的错误。它看起来整洁；然后优化器删除所有断言和你想要进行的调用，你的应用程序以令人印象深刻的方式崩溃。

{{< textdiagram name="fig19.png" figno="19" title="Parallel Pipeline with Kill Signaling" >}}
             #-------------#
             |  Ventilator |
             +-------------+
             |    PUSH     |
             '------+------'
                    |
                    | tasks
                    |
    .---------------+---------------.
    |               |               |
    |     .=========+=====+=========+=====+======.
    |     :         |     :         |     :      :
    v     v         v     v         v     v      :
.------+-----.  .------+-----.  .------+-----.   :
| PULL | SUB |  | PULL | SUB |  | PULL | SUB |   :
+------+-----+  +------+-----+  +------+-----+   :
|   Worker   |  |   Worker   |  |   Worker   |   :
+------------+  +------------+  +------------+   :
|    PUSH    |  |    PUSH    |  |    PUSH    |   :
'-----+------'  '-----+------'  '-----+------'   :
      |               |               |          :
      '---------------+---------------'          :
                      |                          :
                      | results                  :
                      |                          :
                      v                          :
               .-------------.                   :
               |    PULL     |                   :
               +-------------+                   :
               |    Sink     |                   :
               +-------------+                   :
               |     PUB     +==== KILL signal==='
               '-------------'
{{< /textdiagram >}}

让我们看看如何干净地关闭一个进程。我们将采用上一节的并行管道示例。如果我们已经在后台启动了大量工作程序，我们现在想要在批次完成时杀死它们。让我们通过向工作程序发送终止消息来做到这一点。最好的地方是汇，因为它真正了解批次何时完成。

我们如何将汇连接到工作程序？PUSH/PULL 套接字是单向的。我们可以切换到另一种套接字类型，或者我们可以混合多个套接字流。让我们尝试后者：使用发布 - 订阅模型向工作程序发送终止消息：

* 汇在新端点上创建一个 PUB 套接字。
* 工作程序将其输入套接字连接到此端点。
* 当汇检测到批次结束时，它会向其 PUB 套接字发送终止信号。
* 当工作程序检测到终止消息时，它会退出。

汇不需要太多新代码：

{{< fragment name="killsignal" >}}
void *controller = zmq_socket (context, ZMQ_PUB);
zmq_bind (controller, "tcp://*:5559");
...
//  向工作程序发送终止信号
s_send (controller, "KILL");
{{< /fragment >}}

这里是工作程序进程，它管理两个套接字（一个 PULL 套接字获取任务，一个 SUB 套接字获取控制命令），使用我们之前看到的<tt>[zmq_poll()](http://api.zeromq.org/master:zmq_poll)</tt>技术：

{{< examples name="taskwork2" title="Parallel task worker with kill signaling" >}}

这里是修改后的汇应用程序。当它完成收集结果时，它会向所有工作程序广播终止消息：

{{< examples name="tasksink2" title="Parallel task sink with kill signaling" >}}

## 处理中断信号 {#Handling-Interrupt-Signals}

现实应用程序需要在被 Ctrl-C 或其他信号（如<tt>SIGTERM</tt>）中断时干净地关闭。默认情况下，这些只是杀死进程，意味着消息不会被刷新，文件不会被干净地关闭等等。

以下是我们在各种语言中处理信号的方法：

{{< examples name="interrupt" title="Handling Ctrl-C cleanly" >}}

该程序提供<tt>s_catch_signals()</tt>，它捕获 Ctrl-C（<tt>SIGINT</tt>）和<tt>SIGTERM</tt>。当这些信号中的任何一个到达时，<tt>s_catch_signals()</tt>处理程序设置全局变量<tt>s_interrupted</tt>。多亏了你的信号处理程序，你的应用程序不会自动死亡。相反，你有机会清理并优雅地退出。你现在必须显式检查中断并正确处理它。通过在主代码开头调用<tt>s_catch_signals()</tt>（从<tt>interrupt.c</tt>复制）来做到这一点。这设置了信号处理。中断将影响 ZeroMQ 调用，如下所示：

* 如果你的代码阻塞在阻塞调用（发送消息、接收消息或轮询）中，那么当信号到达时，调用将返回<tt>EINTR</tt>。
* 像<tt>s_recv()</tt>这样的包装器在被中断时返回 NULL。

所以检查<tt>EINTR</tt>返回码、NULL 返回和/或<tt>s_interrupted</tt>。

这里是一个典型的代码片段：

```
s_catch_signals ();
client = zmq_socket (...);
while (!s_interrupted) {
    char *message = s_recv (client);
    if (!message)
        break;          //  使用了 Ctrl-C
}
zmq_close (client);
```

如果你调用<tt>s_catch_signals()</tt>并且不测试中断，那么你的应用程序将对 Ctrl-C 和<tt>SIGTERM</tt>免疫，这可能有用，但通常不是。

## 检测内存泄漏 {#Detecting-Memory-Leaks}

任何长时间运行的应用程序都必须正确管理内存，否则最终它会耗尽所有可用内存并崩溃。如果你使用一种自动为你处理的语言，恭喜你。如果你用 C 或 C++ 或任何其他你负责内存管理的语言编程，这里有一个关于使用 valgrind 的简短教程，它会报告你的程序有任何泄漏。

* 要安装 valgrind，例如，在 Ubuntu 或 Debian 上，发出这个命令：

```
sudo apt-get install valgrind
```

* 默认情况下，ZeroMQ 会导致 valgrind 大量抱怨。要删除这些警告，请创建一个名为<tt>vg.supp</tt>的文件，其中包含以下内容：

```
{
   <socketcall_sendto>
   Memcheck:Param
   socketcall.sendto(msg)
   fun:send
   ...
}
{
   <socketcall_sendto>
   Memcheck:Param
   socketcall.send(msg)
   fun:send
   ...
}
```

* 修复你的应用程序，使其在 Ctrl-C 后干净退出。对于任何自行退出的应用程序，这是不需要的，但对于长时间运行的应用程序，这是必不可少的，否则 valgrind 会抱怨所有当前分配的内存。

* 用<tt>-DDEBUG</tt>构建你的应用程序，如果它还不是你的默认设置。这确保 valgrind 可以告诉你确切在哪里内存正在泄漏。

* 最后，这样运行 valgrind：

```
valgrind --tool=memcheck --leak-check=full --suppressions=vg.supp someprog
```

在修复它报告的任何错误后，你应该得到愉快的消息：

```
==30536== ERROR SUMMARY: 0 errors from 0 contexts...
```

## ZeroMQ 多线程编程 {#Multithreading-with-ZeroMQ}

ZeroMQ 可能是编写多线程（MT）应用程序的最佳方式。虽然 ZeroMQ 套接字需要一些调整，如果你习惯于传统套接字，ZeroMQ 多线程将把你所知道的关于编写 MT 应用程序的一切，扔到花园里的堆上，浇上汽油，然后点燃它。这是一本值得焚烧的稀有书籍，但大多数关于并发编程的书都是。

要编写完全完美的 MT 程序（我是字面意义上的），**我们不需要互斥锁、锁或任何其他形式的线程间通信，除了通过 ZeroMQ 套接字发送的消息。**

所谓"完美的 MT 程序"，我指的是易于编写和理解的代码，在任何编程语言中都使用相同的设计方法，在任何操作系统上，并且跨任何数量的 CPU 进行扩展，零等待状态，没有收益递减点。

如果你花了多年时间学习技巧，让你的 MT 代码工作，更不用说快速了，使用锁、信号量和关键部分，当你意识到这一切都是徒劳的时，你会感到厌恶。如果我们从 30 多年的并发编程中学到了一个教训，那就是：*不要共享状态*。这就像两个醉汉试图分享一杯啤酒。不管他们是不是好朋友。迟早，他们会为啤酒打架。你添加到桌子上的醉汉越多，他们就越会为啤酒打架。绝大多数 MT 应用程序看起来像醉汉酒吧打架。

当你编写经典的共享状态 MT 代码时，你需要与之抗争的奇怪问题列表会很有趣，如果它不会直接转化为压力和风险，因为看似工作的代码突然在压力下失败。一家拥有世界级 buggy 代码经验的大型公司发布了其"11 个可能的多线程代码问题"列表，涵盖了遗忘的同步、不正确的粒度、读写撕裂、无锁重新排序、锁护航、两步舞和优先级反转。

是的，我们数了七个问题，不是十一个。但这不是重点。重点是，你真的希望那个运行电网或股市的代码在繁忙的周四下午 3 点开始两步锁护航吗？谁在乎这些术语实际上意味着什么？这不是我们编程的初衷，用越来越复杂的技巧与越来越复杂的副作用作斗争。

一些广泛使用的模型，尽管是整个行业的基础，从根本上说是有缺陷的，共享状态并发就是其中之一。想要无限扩展的代码会像互联网那样做，通过发送消息和共享任何东西，除了对破碎编程模型的共同蔑视之外。

你应该遵循一些规则，用 ZeroMQ 编写快乐的多线程代码：

* 在其线程内私下隔离数据，永远不要在线程之间共享数据。唯一的例外是 ZeroMQ 上下文，它是线程安全的。

* 远离经典的并发机制，如互斥锁、关键部分、信号量等。这些在 ZeroMQ 应用程序中是反模式。

* 在进程开始时创建一个 ZeroMQ 上下文，并将其传递给你想要通过<tt>inproc</tt>套接字连接的所有线程。

* 使用*附加*线程在你的应用程序中创建结构，并使用 PAIR 套接字通过<tt>inproc</tt>将这些线程连接到它们的父线程。模式是：绑定父套接字，然后创建子线程，其子线程连接其套接字。

* 使用*分离*线程模拟独立任务，具有自己的上下文。通过<tt>tcp</tt>连接这些。稍后你可以将这些分解为单独的进程，而无需显著更改代码。

* 线程之间的所有交互都作为 ZeroMQ 消息发生，你可以或多或少地正式定义这些消息。

* 不要在线程之间共享 ZeroMQ 套接字。ZeroMQ 套接字不是线程安全的。从技术上讲，将套接字从一个线程迁移到另一个是可能的，但它需要技巧。唯一在线程之间共享套接字相对合理的地方是语言绑定中，需要对套接字进行垃圾回收等魔法。

如果你需要在一个应用程序中启动多个代理，例如，你会希望每个代理都在自己的线程中运行。很容易犯错误，即在一个线程中创建代理前端和后端套接字，然后将套接字传递给另一个线程中的代理。这在最初可能看起来有效，但在实际使用中会随机失败。记住：*不要在你创建它们的线程之外使用或关闭套接字。*

如果你遵循这些规则，你可以很容易地构建优雅的多线程应用程序，然后根据需要将线程分解为单独的进程。应用程序逻辑可以位于线程、进程或节点中：无论你的扩展需要什么。

ZeroMQ 使用本机操作系统线程，而不是虚拟"绿色"线程。优点是你不需要学习任何新的线程 API，ZeroMQ 线程可以清晰地映射到你的操作系统。你可以使用标准工具，如 Intel 的 ThreadChecker，来查看你的应用程序在做什么。缺点是本机线程 API 并不总是可移植的，如果你有大量线程（数千个），某些操作系统会感到压力。

让我们看看这在实践中是如何工作的。我们将把旧的 Hello World 服务器变成更有能力的东西。原始服务器在单个线程中运行。如果每个请求的工作量很低，这很好：一个ØMQ 线程可以以全速在 CPU 核心上运行，没有等待，做大量工作。但现实服务器必须对每个请求做非平凡的工作。当 10,000 个客户端同时击中服务器时，单个核心可能不够。所以现实服务器会启动多个工作线程。然后它会尽可能快地接受请求，并将这些请求分发给其工作线程。工作线程会努力工作，最终发送回复。

你当然可以使用代理代理和外部工作进程来完成所有这些，但通常启动一个吞噬十六个核心的进程比十六个进程，每个吞噬一个核心更容易。此外，将工作程序作为线程运行将减少网络跳数、延迟和网络流量。

Hello World 服务的 MT 版本基本上将代理和工作程序折叠到一个进程中：

{{< examples name="mtserver" title="Multithreaded service" >}}

{{< textdiagram name="fig20.png" figno="20" title="Multithreaded Server" >}}
               #------------#
               |   Client   |
               +------------+
               |    REQ     |
               '---+--------'
                   |    ^
                   |    |
           "Hello" |    | "World"
.----------------= | -= | =----------------.
|                  v    |                  :
|              .--------+---.              |
|              |   ROUTER   |              |
|              +------------+              |
|              |   Server   |              |
|              +------------+              |
|              |   Queue    |              |
|              |   proxy    |              |
|              +------------+              |
|              |   DEALER   |              |
|              '------------'              |
|                    ^                     |
|                    |                     |
|        .-----------+-----------.         |
|        |           |           |         |
|        v           v           v         |
|    .--------.  .--------.  .--------.    |
|    |  REP   |  |  REP   |  |  REP   |    |
|    +--------+  +--------+  +--------+    |
|    | Worker |  | Worker |  | Worker |    |
|    #--------#  #--------#  #--------#    |
'------------------------------------------'
{{< /textdiagram >}}

所有代码现在对你来说都应该是可识别的。它是如何工作的：

* 服务器启动一组工作线程。每个工作线程创建一个 REP 套接字，然后在该套接字上处理请求。工作线程就像单线程服务器。唯一的区别是传输（<tt>inproc</tt>而不是<tt>tcp</tt>），以及绑定 - 连接方向。

* 服务器创建一个 ROUTER 套接字来与客户端对话，并将其绑定到其外部接口（通过<tt>tcp</tt>）。

* 服务器创建一个 DEALER 套接字来与工作程序对话，并将其绑定到其内部接口（通过<tt>inproc</tt>）。

* 服务器启动一个代理，连接两个套接字。代理公平地从所有客户端中提取传入请求，并将这些请求分发给工作程序。它还会将回复路由回它们的来源。

请注意，创建线程在大多数编程语言中并不是可移植的。POSIX 库是 pthreads，但在 Windows 上你必须使用不同的 API。在我们的示例中，<tt>pthread_create</tt>调用启动了一个新线程，运行我们定义的<tt>worker_routine</tt>函数。我们将在 [第 3 章 - 高级请求 - 回复模式](chapter3#advanced-request-reply) 中看到如何将其包装在可移植的 API 中。

这里的"工作"只是一秒钟的暂停。我们可以在工作程序中做任何事情，包括与其他节点对话。这就是 MT 服务器在ØMQ 套接字和节点方面看起来的样子。请注意请求 - 回复链是<tt>REQ-ROUTER-queue-DEALER-REP</tt>。

## 线程间信号传递（PAIR 套接字） {#Signaling-Between-Threads-PAIR-Sockets}

当你开始使用 ZeroMQ 制作多线程应用程序时，你会遇到如何协调线程的问题。虽然你可能会想插入"sleep"语句，或使用多线程技术，如信号量或互斥锁，**你应该使用的唯一机制是 ZeroMQ 消息**。记住醉汉和啤酒瓶的故事。

让我们制作三个线程，它们在准备好时相互发出信号。在这个示例中，我们使用<tt>inproc</tt>传输上的 PAIR 套接字：

{{< examples name="mtrelay" title="Multithreaded relay" >}}

{{< textdiagram name="fig21.png" figno="21" title="The Relay Race" >}}
#------------#
|   Step 1   |
+------------+
|    PAIR    |
'-----+------'
      |
      | Ready!
      |
      v
.------------.
|    PAIR    |
+------------+
|   Step 2   |
+------------+
|    PAIR    |
'-----+------'
      |
      | Ready!
      |
      v
.------------.
|    PAIR    |
+------------+
|   Step 3   |
#------------#
{{< /textdiagram >}}

这是使用 ZeroMQ 进行多线程的经典模式：

1. 两个线程通过<tt>inproc</tt>通信，使用共享上下文。
1. 父线程创建一个套接字，将其绑定到<tt>inproc:@<*>@</tt>端点，然后*启动子线程，将上下文传递给它。
1. 子线程创建第二个套接字，将其连接到该<tt>inproc:@<*>@</tt>端点，然后*向父线程发出信号，表明它已经准备好了。

请注意，使用此模式的多线程代码无法扩展到进程。如果你使用<tt>inproc</tt>和套接字对，你正在构建一个紧耦合的应用程序，即你的线程在结构上相互依赖。在延迟真正至关重要时这样做。另一种设计模式是松耦合应用程序，其中线程有自己的上下文，并通过<tt>ipc</tt>或<tt>tcp</tt>通信。你可以轻松地将松耦合线程分解为单独的进程。

这是我们第一次展示使用 PAIR 套接字的示例。为什么要使用 PAIR？其他套接字组合可能看起来有效，但它们都有可能干扰信号的副作用：

* 你可以为发送者使用 PUSH，为接收者使用 PULL。这看起来很简单，而且会奏效，但请记住，PUSH 会将消息分发给所有可用的接收者。如果你不小心启动了两个接收者（例如，你已经有一个在运行，你又启动了第二个），你会"丢失"一半的信号。PAIR 具有拒绝多个连接的优势；这对是*独占的*。

* 你可以为发送者使用 DEALER，为接收者使用 ROUTER。然而，ROUTER 会将你的消息包装在一个"信封"中，意味着你的零大小信号变成一个多部分消息。如果你不关心数据，将任何东西都视为有效信号，而且你不会从套接字读取多次，那这无关紧要。但是，如果你决定发送真实数据，你会突然发现 ROUTER 为你提供了"错误"的消息。DEALER 还会分发传出消息，给出与 PUSH 相同的风险。

* 你可以为发送者使用 PUB，为接收者使用 SUB。这将正确地完全按照你发送的方式传递你的消息，PUB 不会像 PUSH 或 DEALER 那样分发。但是，你需要用空订阅配置订阅者，这很烦人。

出于这些原因，PAIR 成为协调线程对之间的最佳选择。

## 节点协调 {#Node-Coordination}

当你想要协调网络上的一组节点时，PAIR 套接字将不再很好地工作。这是线程和节点策略不同的少数几个领域之一。principally，节点来来去去，而线程通常是静态的。PAIR 套接字在远程节点消失并返回时不会自动重新连接。

{{< textdiagram name="fig22.png" figno="22" title="Pub-Sub Synchronization" >}}
#------------#
| Publisher  |
+-----+------+
| PUB | REP  |
'--+--+----+-'
   |    ^  |
(3)| (1)|  |(2)
   |    |  |
   v    |  v
.-----+-+----.
| SUB | REQ  |
+-----+------+
| Subscriber |
#------------#
{{< /textdiagram >}}

线程和节点的第二个重要区别是，你通常有固定数量的线程，但节点数量更可变。让我们用我们早期的一个场景（天气服务器和客户端），并使用节点协调来确保订阅者在启动时不会丢失数据。

这是应用程序的工作方式：

* 发布者提前知道它期望多少订阅者。这只是它从某个地方得到的一个魔术数字。

* 发布者启动并等待所有订阅者连接。这是节点协调部分。每个订阅者订阅，然后通过另一个套接字告诉发布者它已经准备好了。

* 当发布者连接了所有订阅者时，它开始发布数据。

在这种情况下，我们将使用 REQ-REP 套接字流来同步订阅者和发布者。这里是发布者：

{{< examples name="syncpub" title="Synchronized publisher" >}}

这里是订阅者：

{{< examples name="syncsub" title="Synchronized subscriber" >}}

这个 Bash shell 脚本将启动十个订阅者，然后启动发布者：

```
echo "Starting subscribers..."
for ((a=0; a<10; a++)); do
    syncsub &
done
echo "Starting publisher..."
syncpub
```

这给了我们这个令人满意的输出：

```
Starting subscribers...
Starting publisher...
Received 1000000 updates
Received 1000000 updates
...
Received 1000000 updates
Received 1000000 updates
```

我们不能假设 SUB 连接会在 REQ/REP 对话完成时完成。除了<tt>inproc</tt>之外，如果你使用任何传输，都没有保证出站连接会以任何顺序完成。所以，示例在订阅和发送 REQ/REP 同步之间做了一秒钟的暴力睡眠。

一个更健壮的模型可能是：

* 发布者打开 PUB 套接字，并开始发送"Hello"消息（不是数据）。
* 订阅者连接 SUB 套接字，当它们收到 Hello 消息时，它们通过 REQ/REP 套接字对告诉发布者。
* 当发布者获得了所有必要的确认后，它开始发送真实数据。

## 零拷贝 {#Zero-Copy}

ZeroMQ 的消息 API 让你可以直接从和到应用程序缓冲区发送和接收消息，而无需复制数据。我们称之为*零拷贝*，它可以在某些应用程序中提高性能。

你应该在特定情况下考虑使用零拷贝，即你以高频率发送大块内存（数千字节）。对于短消息，或较低的消息速率，使用零拷贝会使你的代码更混乱、更复杂，而没有可衡量的好处。像所有优化一样，在你知道它有帮助时使用它，并*在前后进行测量*。

要进行零拷贝，你使用<tt>[zmq_msg_init_data()](http://api.zeromq.org/master:zmq_msg_init_data)</tt>创建一个引用已经用<tt>malloc()</tt>或其他分配器分配的内存块的消息，然后你将其传递给<tt>[zmq_msg_send()](http://api.zeromq.org/master:zmq_msg_send)</tt>。当你创建消息时，你还要传递一个函数，ZeroMQ 在完成发送消息时将调用该函数来释放内存块。这是最简单的示例，假设<tt>buffer</tt>是在堆上分配的 1,000 字节块：

{{< fragment name="zerocopy" >}}
void my_free (void *data, void *hint) {
    free (data);
}
//  从缓冲区发送消息，我们分配，ZeroMQ 将为我们释放
zmq_msg_t message;
zmq_msg_init_data (&message, buffer, 1000, my_free, NULL);
zmq_msg_send (&message, socket, 0);
{{< /fragment >}}

请注意，在发送消息后，你不会调用<tt>[zmq_msg_close()](http://api.zeromq.org/master:zmq_msg_close)</tt>——<tt>libzmq</tt>会在实际完成发送消息时自动执行此操作。

没有办法在接收时进行零拷贝：ZeroMQ 为你提供一个缓冲区，你可以根据需要存储它，但它不会直接将数据写入应用程序缓冲区。

在写入时，ZeroMQ 的多部分消息与零拷贝很好地协同工作。在传统消息传递中，你需要将不同的缓冲区组合在一起，形成一个你可以发送的缓冲区。这意味着复制数据。使用 ZeroMQ，你可以将来自不同来源的多个缓冲区作为单独的消息帧发送。发送每个字段作为长度定界的帧。对应用程序来说，它看起来像一系列发送和接收调用。但在内部，多个部分会通过单个系统调用写入网络和读回，因此它非常高效。

## 发布 - 订阅消息信封 {#Pub-Sub-Message-Envelopes}

在发布 - 订阅模式中，我们可以将键拆分成一个单独的消息帧，我们称之为*信封*。如果你想使用发布 - 订阅信封，请自己制作。这是可选的，在之前的发布 - 订阅示例中我们没有这样做。使用发布 - 订阅信封对于简单情况来说有点多做一些工作，但对于真实情况来说更干净，其中键和数据是自然分开的东西。

{{< textdiagram name="fig23.png" figno="23" title="Pub-Sub Envelope with Separate Key" >}}
          #--------#
Frame 1   | Key    |   消息信封
          +--------+
Frame 2   | Data   |   实际消息体
          #--------#
{{< /textdiagram >}}

订阅进行前缀匹配。也就是说，它们寻找"所有以 XYZ 开头的消息"。明显的问题是：如何从数据中定界键，以便前缀匹配不会意外地匹配数据。最好的答案是使用信封，因为匹配不会跨越帧边界。这里是一个关于发布 - 订阅信封在代码中看起来如何的最小示例。这个发布者发送两种类型的消息，A 和 B。

信封保存消息类型：

{{< examples name="psenvpub" title="Pub-Sub envelope publisher" >}}

订阅者只想要 B 类型的消息：

{{< examples name="psenvsub" title="Pub-Sub envelope subscriber" >}}

当你运行这两个程序时，订阅者应该向你显示这个：

```
[B] We would like to see this
[B] We would like to see this
[B] We would like to see this
...
```

这个示例表明，订阅过滤器拒绝或接受整个多部分消息（键加数据）。你永远不会得到多部分消息的一部分。如果你订阅多个发布者，并且你想知道它们的地址，以便你可以通过另一个套接字向它们发送数据（这是一个典型的用例），创建一个三部分消息。

{{< textdiagram name="fig24.png" figno="24" title="Pub-Sub Envelope with Sender Address" >}}
          #---------#
Frame 1   | Key     |   订阅键
          +---------+
Frame 2   | Address |   发布者地址
          +---------+
Frame 3   | Data    |   实际消息体
          #---------#
{{< /textdiagram >}}

## 高水位标记 {#High-Water-Marks}

当你可以在进程之间快速发送消息时，你很快就会发现内存是一种宝贵的资源，而且是一种可以被轻易填满的资源。进程中的几秒钟延迟可能会变成积压，除非您理解问题并采取预防措施，否则会炸毁服务器。

问题是这样的：假设你有进程 A 以高频率向进程 B 发送消息，而进程 B 正在处理它们。突然 B 变得非常繁忙（垃圾收集、CPU 过载等），并且在短时间内无法处理消息。对于某些繁重的垃圾收集，这可能是几秒钟，或者如果有更严重的问题，可能会更长。A 进程仍在疯狂尝试发送的消息会发生什么？一些会坐在 B 的网络缓冲区中。一些会坐在以太网线上。一些会坐在 A 的网络缓冲区中。其余的会在 A 的内存中累积，因为应用程序 A 背后发送它们的速度很快。如果您不采取一些预防措施，A 很容易耗尽内存并崩溃。

这是消息代理的一致的、经典的问题。这更伤人，因为表面上这是 B 的错，而 B 通常是用户编写的应用程序，A 无法控制。

答案是什么？一个是将问题向上游传递。A 从其他地方获取消息。所以告诉那个进程，"停止！"等等。这被称为*流量控制*。听起来很有道理，但如果你要发送 Twitter 提要怎么办？你是否告诉整个世界停止发推，而 B 会整理好自己的事情？

流量控制在某些情况下有效，但在其他情况下无效。传输层无法告诉应用层"停止"，就像地铁系统无法告诉大企业"请让你的员工再工作半小时。我太忙了"。消息传递的答案是设置缓冲区大小的限制，然后当我们达到这些限制时，采取一些明智的行动。在某些情况下（不是地铁系统），答案是扔掉消息。在其他情况下，最好的策略是等待。

ZeroMQ 使用 HWM（高水位标记）的概念来定义其内部管道的容量。每个套接字的出站或入站连接都有自己的管道，以及用于发送和/或接收的 HWM，具体取决于套接字类型。一些套接字（PUB、PUSH）只有发送缓冲区。一些（SUB、PULL、REQ、REP）只有接收缓冲区。一些（DEALER、ROUTER、PAIR）既有发送缓冲区也有接收缓冲区。

在 ZeroMQ v2.x 中，HWM 默认是无限的。这很容易，但也通常对高容量发布者是致命的。在 ZeroMQ v3.x 中，它默认设置为 1,000，这更合理。如果你仍在使用 ZeroMQ v2.x，你应该始终在套接字上设置 HWM，无论是 1,000 以匹配 ZeroMQ v3.x，还是考虑到你的消息大小和预期订阅者性能的另一个数字。

当你的套接字达到其 HWM 时，它会根据套接字类型阻塞或丢弃数据。PUB 和 ROUTER 套接字在达到其 HWM 时会丢弃数据，而其他套接字类型会阻塞。在<tt>inproc</tt>传输上，发送者和接收者共享相同的缓冲区，因此真正的 HWM 是双方设置的 HWM 的总和。

最后，HWM 不是精确的；虽然你可能默认获得*多达*1,000 条消息，但由于<tt>libzmq</tt>实现其队列的方式，实际缓冲区大小可能会低得多（低至一半）。

## 缺失消息问题求解器 {#Missing-Message-Problem-Solver}

当你使用 ZeroMQ 构建应用程序时，你会多次遇到这个问题：丢失你期望接收的消息。我们整理了一个图表，引导你了解最常见的原因。

{{< textdiagram name="fig25.png" figno="25" title="Missing Message Problem Solver" >}}
.---------------.        .---------------.        .----------------.
| So you're not |        | Do you set a  |        | On SUB sockets |
| getting every |    .-->| subscription  +------->| you have to    |
| message?      |    |   | for messages? | No     | subscribe to   |
'--------+------'    |   '-------+-------'        | get messages   |
         | Yes       |           | Yes            '----------------'
         v           |           v
.----------------.   |   .----------------.        .---------------.
| Are you losing |   |   | Do you start   |        | Start all SUB |
| messages in a  +---'   | the SUB socket +------->| sockets first |
| SUB socket?    | Yes   | after the PUB? | Yes    | then the PUB  |
'--------+-------'       '--------+-------'        '---------------'
         | No                     | No
         v                        v             .------------------.
.---------------.       .-----------------.     | Send and recv in |
| Are you using | Yes   | See explanation |     | a loop and check |
| REQ and REP?  +---.   | of slow joiners |  .->| return codes.    |
'--------+------'   |   | in the text     |  |  | With REP, recv   |
         | No       |   '-----------------'  |  | and send         |
         v          '------------------------'  '------------------'
.-----------------.      .----------------.
|  Are you using  +--.   | First PULL can |       .---------------.
|  PUSH sockets?  |  '-->| grab many msgs |       | Use the load  |
'--------+--------' Yes  | while others   +--.    | balancing     |
         | No            | are still busy |  '--->| pattern and   |
         v               | connecting     |       | ROUTER/DEALER |
.-----------------.      '----------------'       | sockets       |
|  Do you check   | No                            '---------------'
| return codes on +---.   .----------------.
|  all methods?   |   |   | Check each 0MQ |   .------------------.
'--------+--------'   '-->| method call    |   | Use sockets only |
         | Yes            '----------------'   | in their owning  |
         v                                     | threads unless   |
.-----------------.      .---.      .--------->| you know about   |
| Are you using a |      |   |      |          | memory barriers  |
| socket in more  +------'   |      |          '------------------'
| than 1 thread?  | Yes      '------'
'--------+--------'                               .---------------.
         | No             .----------------.      | To use inproc |
         v                | Do you call    |      | your sockets  |
.---------------.   .---->| zmq_ctx_new    +---->| must be in    |
| Are you using |   |     | twice or more? | Yes  | the same 0MQ  |
| the inproc:// +---'     '--------+-------'      | context       |
| transport?    | Yes              | No           '---------------'
'--------+------'                  v
         | No             .-----------------.
         v                | Check that you  |
.-----------------.       | bind before you |
|  Are you using  | Yes   | connect         |
| ROUTER sockets? +---.   '-----------------'
'--------+--------'   |
         | No         |   .----------------.     .------------.
         v            |   | Check that the |     | If you use |
.----------------.    |   | reply address  |     | identities |
| Make a minimal |    '-->| is valid. 0MQ  +---->| set them   |
| test case, ask |        | drops messages |     | before you |
| on IRC channel |        | it can't route |     | connect    |
'----------------'        '----------------'     '------------'
{{< /textdiagram >}}

以下是图表所说的总结：

* 在 SUB 套接字上，使用<tt>[zmq_setsockopt()](http://api.zeromq.org/master:zmq_setsockopt)</tt>和<tt>ZMQ_SUBSCRIBE</tt>设置订阅，否则你不会收到消息。因为你通过前缀订阅消息，如果你订阅""（空订阅），你会得到所有东西。

* 如果你在 PUB 套接字开始发送数据*之后*启动 SUB 套接字（即，建立与 PUB 套接字的连接），你将丢失它在连接建立之前发布的任何内容。如果这是一个问题，请设置你的架构，使 SUB 套接字首先启动，然后 PUB 套接字开始发布。

* 即使你同步 SUB 和 PUB 套接字，你可能仍然会丢失消息。这是由于内部队列直到实际建立连接才会创建的事实。如果你可以切换绑定/连接方向，使 SUB 套接字绑定，PUB 套接字连接，你可能会发现它更符合你的预期。

* 如果你使用 REP 和 REQ 套接字，并且你不坚持同步 send/recv/send/recv 顺序，ZeroMQ 会报告错误，你可能会忽略这些错误。然后，看起来你会丢失消息。如果你使用 REQ 或 REP，坚持 send/recv 顺序，并且始终在真实代码中检查 ZeroMQ 调用的错误。

* 如果你使用 PUSH 套接字，你会发现第一个连接的 PULL 套接字会抓取不公平的消息份额。只有当所有 PULL 套接字都成功连接时，消息才会准确轮换，这可能需要几毫秒。作为 PUSH/PULL 的替代方案，对于较低的数据速率，考虑使用 ROUTER/DEALER 和负载平衡模式。

* 如果你在线程之间共享套接字，不要。它会导致随机的奇怪行为和崩溃。

* 如果你使用<tt>inproc</tt>，请确保两个套接字都在同一个上下文中。否则，连接端实际上会失败。此外，先绑定，然后连接。<tt>inproc</tt>不是像<tt>tcp</tt>那样的断开连接传输。

* 如果你使用 ROUTER 套接字，很容易意外地丢失消息，通过发送格式错误的身份帧（或忘记发送身份帧）。通常在 ROUTER 套接字上设置<tt>ZMQ_ROUTER_MANDATORY</tt>选项是一个好主意，但也要检查每次发送调用的返回码。

* 最后，如果你真的无法弄清楚哪里出了问题，制作一个*最小*的测试用例，重现问题，并向 ZeroMQ 社区寻求帮助。