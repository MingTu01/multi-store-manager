import { useFitText } from '../hooks/useFitText';

interface FitTextProps {
  text: string;
  className?: string;
  minFontSize?: number;
  maxFontSize?: number;
  safety?: number;
}

/**
 * 自适应单行文字组件：根据容器宽度自动缩放字号，撑满可用宽度。
 */
export function FitText({ text, className = '', minFontSize = 8, maxFontSize = 16, safety = 0.92 }: FitTextProps) {
  const { ref, fontSize } = useFitText(text, { minFontSize, maxFontSize, safety });
  return (
    <div ref={ref} className={'w-full overflow-hidden ' + className} style={{ fontSize: `${fontSize}px`, lineHeight: 1.1 }}>
      {text}
    </div>
  );
}
