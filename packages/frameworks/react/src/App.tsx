import { useEffect, useState } from "react";
import { createClient, createRivetKit } from "../lib/mod";

const client = createClient("http://localhost:3000", {
	encoding: "json",
});

const { useWorker } = createRivetKit(client);

function App() {
	const [state, setState] = useState(0);
	const f = useWorker({
		name: "foo",
		key: "bar",
		params: { baz: "qux" },
		select: (state) => state,
	});

	console.log("state", f);
	return (
		<>
			<button
				type="button"
				onClick={() => {
					setState((prev) => (prev ? prev + 1 : 1));
				}}
			>
				Increment State
			</button>
			<p>State: {state}</p>
			<h1>Vite + React</h1>
			<div className="card">
				<p>
					Edit <code>src/App.tsx</code> and save to test HMR
				</p>
			</div>
			<p className="read-the-docs">
				Click on the Vite and React logos to learn more
			</p>
			<Test />
			<Test />
			<Test />
			<Test />
			<Test />
			<Test />
			<Test />
			<Test />
			<Test />
			<Test />
			<Test />
		</>
	);
}

function Test() {
	const f = useWorker({
		name: "foo",
		key: "bar",
		params: { baz: "qux" },
		select: (state) => state,
	});

	return (
		<div>
			<h2>Test Component</h2>
			<p>This is a test component to check rendering.</p>
			<pre>{JSON.stringify(f, null, 2)}</pre>
		</div>
	);
}

export default App;
