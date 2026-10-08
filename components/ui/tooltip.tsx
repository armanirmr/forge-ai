"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
	return <TooltipPrimitive.Provider delay={350} closeDelay={100}>{children}</TooltipPrimitive.Provider>;
}

export function HelpTooltip({ label, children }: { label: string; children?: ReactNode }) {
	return (
		<TooltipPrimitive.Root>
			<TooltipPrimitive.Trigger
				aria-label={label}
				className="inline-grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
			>
				<CircleHelp aria-hidden="true" className="size-4" />
			</TooltipPrimitive.Trigger>
			<TooltipPrimitive.Portal>
				<TooltipPrimitive.Positioner sideOffset={8}>
					<TooltipPrimitive.Popup className="z-50 max-w-72 rounded-md border border-border bg-popover px-3 py-2 text-left text-xs leading-5 text-popover-foreground shadow-lg shadow-foreground/10 outline-none data-[starting-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[ending-style]:opacity-0 data-[ending-style]:-translate-y-1 transition duration-150">
						<TooltipPrimitive.Arrow className="relative block h-1.5 w-3 overflow-clip data-[side=bottom]:top-[-6px] data-[side=left]:right-[-9px] data-[side=left]:rotate-90 data-[side=right]:left-[-9px] data-[side=right]:-rotate-90 data-[side=top]:bottom-[-6px] data-[side=top]:rotate-180 before:absolute before:bottom-0 before:left-1/2 before:h-[calc(6px*sqrt(2))] before:w-[calc(6px*sqrt(2))] before:translate-x-[-50%] before:translate-y-[50%] before:rotate-45 before:border before:border-border before:bg-popover before:content-['']" />
						{children}
					</TooltipPrimitive.Popup>
				</TooltipPrimitive.Positioner>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	);
}
