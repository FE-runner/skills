## Purpose

定义 CLI 安装技能时按文件内容类型无损写入磁盘的行为：文本按 UTF-8、二进制按原始字节，并对服务端下发的
Base64 内容做前置校验，校验不通过时明确失败且不在磁盘上留下半成品。

## ADDED Requirements

### Requirement: 按内容类型无损落盘

系统 SHALL 在安装技能时按内容类型落盘：文本内容按 UTF-8 写入；二进制内容按原始字节写入，SHALL NOT 经过
任何字符编码转换。

Market 安装响应中的 `binaryFiles`（若存在）SHALL 与 `files` 合并进同一份文件集合，键为技能根相对路径，
使按文件数量与文件名列举的行为对两类内容一致。

#### Scenario: 响应含 binaryFiles 时二进制无损落盘

- **WHEN** 安装响应包含 `binaryFiles: { "assets/logo.png": "<标准 Base64>" }`
- **THEN** 该文件以原始字节写入安装目录，从磁盘读回的字节与 Base64 解码结果逐字节一致

#### Scenario: 纯文本技能行为不变

- **WHEN** 安装响应只包含 `files`
- **THEN** 所有文件按 UTF-8 写入，文件集合与本次变更前完全一致

### Requirement: 旧服务端响应保持行为不变

当安装响应不包含 `binaryFiles` 字段时，系统 SHALL 与本次变更前的行为完全一致：不报错、不输出额外提示、
不改变写入文件的数量与内容。

#### Scenario: 响应不含 binaryFiles

- **WHEN** 安装响应没有 `binaryFiles` 字段
- **THEN** 安装成功且结果与本次变更前完全一致，无警告、无错误

### Requirement: 二进制内容的前置校验与失败语义

系统 SHALL 在写入或清理任何文件之前，校验全部二进制内容。校验口径为严格标准 Base64：字符集
`A-Za-z0-9+/`、可带 `=` padding、长度满足 `% 4 === 0`、解码后回编码与输入一致、且解码结果非空。

任一文件不通过校验时，系统 SHALL 判定本次安装失败并给出可读错误，SHALL NOT 创建、清空或改写目标目录，
SHALL NOT 在磁盘上留下该技能的任何文件。

#### Scenario: Base64 非法导致安装失败且不落盘

- **WHEN** 某个 `binaryFiles` 条目的值不是合法标准 Base64（含非法字符，或长度不是 4 的倍数）
- **THEN** 安装失败并报出错误，目标目录未被创建或清空，磁盘上不出现该技能的任何文件

#### Scenario: 解码结果为空导致安装失败

- **WHEN** 某个 `binaryFiles` 条目的值解码后长度为 0
- **THEN** 安装失败并报出错误，不落任何文件

### Requirement: skillFolderHash 原样写锁

系统 SHALL 把服务端返回的 `skillFolderHash` 原样写入锁文件，SHALL NOT 基于本地文件内容重新计算或改写。

#### Scenario: 含二进制的技能写锁

- **WHEN** 安装成功且服务端返回 `skillFolderHash`
- **THEN** 锁文件中的 `skillFolderHash` 与响应值逐字一致
