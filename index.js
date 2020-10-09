const fs = require('fs/promises');
const fetch = require('node-fetch');
const chokidar = require('chokidar');
const { createCanvas, loadImage } = require('canvas');
const config = require('config');

async function ProcessImage(path) {
	console.log('New image found: ', path);
	const img = await loadImage(path);
	console.log('Image loaded');

	let canvasWidth = img.width;
	const aspect = img.height / img.width;

	if (config.has('canvasSize')) {
		canvasWidth = config.get('canvasSize');
	}

	const canvas = createCanvas(canvasWidth, canvasWidth * aspect);
	const ctx = canvas.getContext("2d");
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

	const dataUrl = canvas.toDataURL();
	const metaIndex = dataUrl.indexOf(',');
	const base64 = dataUrl.substring(metaIndex + 1);

	const requestData = {
		detector_name: "default",
		data: base64,
		detect: {
			"*": 50
		}
	};

	console.log('Sending image to server');
	const result = await fetch(config.get('doods.url'), {
		method:"POST",
		body: JSON.stringify(requestData)
	});

	const data = await result.json();
	if (data.detections) {
		console.log(`Server came back with ${data.detections.length} objects detected`);
		for (var i = 0; i < data.detections.length; ++i) {
			let det = data.detections[i];

			let x = canvas.width * det.left;
			let y = canvas.height * det.top;

			let w = canvas.width * (det.right - det.left);
			let h = canvas.height * (det.bottom - det.top);

			ctx.lineWidth = 3;
			ctx.strokeStyle = "red";
			ctx.fillStyle = "red";
			ctx.font = "24px Verdana";
			ctx.strokeRect(x, y, w, h); 
			ctx.fillText(`${det.label} (${det.confidence})`, x + 5, y + 30);
		}

		// save and alert if objects where detected
		const buffer = canvas.toBuffer('image/jpeg');
		await fs.writeFile(path, buffer);
		console.log('Edited image writen back');
	} else {
		console.log('Server came back without objects detected');
	}
}

function OnError(error) {
	console.error('Error happened: ', error);
}

function OnFileAdded(path) {
	ProcessImage(path).catch(OnError);
}

const watcher = chokidar.watch(config.get('watchDir'), { ignored: /^\./, persistent: true, ignoreInitial: true });

watcher
	.on('add', OnFileAdded)
	.on('error', OnError);

console.log('Started watching files');
