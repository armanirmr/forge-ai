type BrandMarkProps = {
	className?: string;
};

export function BrandMark({ className = "" }: BrandMarkProps) {
	return (
		<span
			aria-hidden="true"
			className={`grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary text-primary-foreground shadow-sm ${className}`}
		>
			<svg viewBox="0 0 40 40" fill="none" className="size-[76%]" xmlns="http://www.w3.org/2000/svg">
				<path
					d="M29.5 11.5H19.25a9.25 9.25 0 1 0 0 18.5H29.5"
					stroke="currentColor"
					strokeWidth="3.4"
					strokeLinecap="round"
				/>
				<path
					d="M25.5 16.5h10M25.5 23.5h10"
					stroke="#78E1BD"
					strokeWidth="2.8"
					strokeLinecap="round"
				/>
			</svg>
		</span>
	);
}
