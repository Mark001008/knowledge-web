import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * 通用 Markdown 渲染组件
 * 将 Markdown 文本转换为 HTML 并渲染
 * 所有内容统一经过 DOMPurify 消毒，防止 XSS 攻击
 */
export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const html = useMemo(() => {
    if (!content) return "";
    // 统一走 Markdown 解析 + DOMPurify 消毒
    const rawHtml = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(rawHtml);
  }, [content]);

  return (
    <div
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
