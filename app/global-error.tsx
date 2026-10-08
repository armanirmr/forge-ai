"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return (
		<html lang="en">
			<body style={{ margin: 0, background: "Canvas", color: "CanvasText", fontFamily: "system-ui, sans-serif" }}>
				<main style={{ boxSizing: "border-box", display: "grid", minHeight: "100vh", placeItems: "center", padding: "2rem" }}>
					<section style={{ width: "min(100%, 42rem)", borderTop: "1px solid #e3e8f2", borderBottom: "1px solid #e3e8f2", padding: "3rem 0" }}>
						<p style={{ color: "#0b64dd", fontSize: ".875rem", fontWeight: 700 }}>CHANGEWEFT · RECOVERY</p>
						<h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", letterSpacing: "-.03em", margin: "1rem 0" }}>Changeweft needs a fresh start.</h1>
						<p style={{ color: "GrayText", fontSize: "1rem", lineHeight: 1.7, maxWidth: "42rem" }}>The app shell encountered an unexpected problem. Try loading Changeweft again.</p>
						<button onClick={reset} style={{ marginTop: "1.5rem", border: 0, borderRadius: ".5rem", background: "#0b64dd", color: "white", cursor: "pointer", font: "inherit", fontWeight: 600, padding: ".7rem 1rem" }}>Reload Changeweft</button>
					</section>
				</main>
			</body>
		</html>
	);
}
