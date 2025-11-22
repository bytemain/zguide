---
title: 前言
weight: 0
date: 2025-11-21
---

**作者：Pieter Hintjens，iMatix 首席执行官**

请使用 [GitHub issue 追踪器](https://github.com/booksbyus/zguide/issues) 来提交所有评论和勘误。本版本涵盖了 ZeroMQ 的最新稳定版本（3.2）。如果您使用的是旧版本的 ZeroMQ，那么某些示例和解释可能不准确。

本指南最初是用 [C 语言](/page:all) 编写的，但也有 [PHP](/php:all)、[Java](/java:all)、[Python](/py:all)、[Lua](/lua:all) 和 [Haxe](/hx:all) 版本。我们还将大多数示例翻译成了 C++、C#、CL、Delphi、Erlang、F#、Felix、Haskell、Julia、Objective-C、Ruby、Ada、Basic、Clojure、Go、Haxe、Node.js、ooc、Perl 和 Scala。

## ZeroMQ 百字简介

ZeroMQ（也称为 0MQ、0\MQ 或 zmq）看起来像一个可嵌入的网络库，但行为却像一个并发框架。它为您提供套接字，这些套接字可以在各种传输方式（如进程内、进程间、TCP 和多播）上传递原子消息。您可以使用扇出、发布 - 订阅、任务分发和请求 - 回复等模式将套接字 N 对 N 连接。它的速度足以成为集群产品的网络结构。其异步 I/O 模型为您提供了可扩展的多核应用程序，这些应用程序被构建为异步消息处理任务。它有数十种语言 API，可在大多数操作系统上运行。ZeroMQ 来自 [iMatix](http://www.imatix.com)，是 LGPLv3 开源的。

## 起源

我们拿了一个普通的 TCP 套接字，给它注入了从苏联秘密原子研究项目中偷来的放射性同位素混合物，用 1950 年代的宇宙射线轰击它，然后把它交给一个有药物瘾的漫画书作者，他对穿着氨纶的鼓胀肌肉有着难以掩饰的恋物癖。是的，ZeroMQ 套接字是网络世界的超级英雄。

## Zero 的禅意

ZeroMQ 中的Ø完全是关于权衡的。一方面，这个奇怪的名字降低了 ZeroMQ 在 Google 和 Twitter 上的可见度。另一方面，它惹恼了一些丹麦人，他们给我们写了一些像"ØMG røtfl"和"Ø不是一个看起来滑稽的零！"以及"//Rødgrød med fløde!//"这样的话，这显然是一种侮辱，意思是"愿你的邻居是格伦德尔的直系后代！"看起来是个公平的权衡。

最初，ZeroMQ 中的零意味着"零代理"和（尽可能接近）"零延迟"。从那时起，它已经涵盖了不同的目标：零管理、零成本、零浪费。更一般地说，"零"指的是贯穿项目的极简主义文化。我们通过移除复杂性而不是暴露新功能来增加能力。

## 读者对象

本书是为想要学习如何制作大规模分布式软件的专业程序员而写的，这些软件将主导计算的未来。我们假设您能够阅读 C 代码，因为尽管 ZeroMQ 用于许多语言，但这里的大多数示例都是 C 语言的。我们假设您关心规模，因为 ZeroMQ 首先解决这个问题。我们假设您需要以尽可能低的成本获得最佳结果，因为否则您不会欣赏 ZeroMQ 所做的权衡。除了这些基本背景之外，我们还会介绍您使用 ZeroMQ 所需的所有网络和分布式计算概念。

## 致谢

感谢 Andy Oram 让 [O'Reilly 书籍](http://shop.oreilly.com/product/0636920026136.do) 得以出版，并编辑了本文。

感谢所有为本书做出贡献的人：Bill Desmarais、Brian Dorsey、Daniel Lin、Eric Desgranges、Gonzalo Diethelm、Guido Goldstein、Hunter Ford、Kamil Shakirov、Martin Sustrik、Mike Castleman、Naveen Chawla、Nicola Peduzzi、Oliver Smith、Olivier Chamoux、Peter Alexander、Pierre Rouleau、Randy Dryburgh、John Unwin、Alex Thomas、Mihail Minkov、Jeremy Avnet、Michael Compton、Kamil Kisiel、Mark Kharitonov、Guillaume Aubert、Ian Barber、Mike Sheridan、Faruk Akgul、Oleg Sidorov、Lev Givon、Allister MacLeod、Alexander D'Archangel、Andreas Hoelzlwimmer、Han Holl、Robert G. Jakabosky、Felipe Cruz、Marcus McCurdy、Mikhail Kulemin、Dr. Gergő Érdi、Pavel Zhukov、Alexander Else、Giovanni Ruggiero、Rick "Technoweenie"、Daniel Lundin、Dave Hoover、Simon Jefford、Benjamin Peterson、Justin Case、Devon Weller、Richard Smith、Alexander Morland、Wadim Grasza、Michael Jakl、Uwe Dauernheim、Sebastian Nowicki、Simone Deponti、Aaron Raddon、Dan Colish、Markus Schirp、Benoit Larroque、Jonathan Palardy、Isaiah Peng、Arkadiusz Orzechowski、Umut Aydin、Matthew Horsfall、Jeremy W. Sherman、Eric Pugh、Tyler Sellon、John E. Vincent、Pavel Mitin、Min RK、Igor Wiedler、Olof Åkesson、Patrick Lucas、Heow Goodman、Senthil Palanisami、John Gallagher、Tomas Roos、Stephen McQuay、Erik Allik、Arnaud Cogoluègnes、Rob Gagnon、Dan Williams、Edward Smith、James Tucker、Kristian Kristensen、Vadim Shalts、Martin Trojer、Tom van Leeuwen、Hiten Pandya、Harm Aarts、Marc Harter、Iskren Ivov Chernev、Jay Han、Sonia Hamilton、Nathan Stocks、Naveen Palli 和 Zed Shaw。
