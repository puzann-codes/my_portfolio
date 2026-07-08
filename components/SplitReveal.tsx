type SplitRevealProps = {
  text: string;
  className?: string;
  wordClassName?: string;
  as?: keyof React.JSX.IntrinsicElements;
};

/** Splits text into words, each wrapped in a mask span so it can be
 * revealed with a translateY tween on the inner span. */
export default function SplitReveal({
  text,
  className,
  wordClassName,
  as: Tag = "span",
}: SplitRevealProps) {
  const words = text.split(" ");
  return (
    <Tag className={className}>
      {words.map((word, i) => (
        <span
          key={i}
          className="reveal-mask inline-block align-top pb-[0.08em]"
        >
          <span
            className={`split-word inline-block will-change-transform ${wordClassName ?? ""}`}
            style={{ transform: "translateY(110%)" }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </Tag>
  );
}
