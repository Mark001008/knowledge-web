import { useMemo } from "react";
import { marked } from "marked";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * 通用 Markdown 渲染组件
 * 将 Markdown 文本转换为 HTML 并渲染
 */
export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const html = useMemo(() => {
    if (!content) return "";
    // 如果已经是 HTML，直接返回
    if (content.trimStart().startsWith("<")) return content;
    // 否则当作 Markdown 转换
    return marked.parse(content, { async: false }) as string;
  }, [content]);

  return (
    <div
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
