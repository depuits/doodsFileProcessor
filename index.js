const path = require('path');
const fs = require('fs/promises');
const fetch = require('node-fetch');
const chokidar = require('chokidar');
const { createCanvas, loadImage } = require('canvas');
const config = require('config');
const btoa = require('btoa');

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
};

// when the image file is not completly written to the disk the loadImage might
// fail because incomplete data. When this happens we wait a bit and then retry
async function forceLoadImage(filePath) {
	while (true) {
		try {
			return await loadImage(filePath);
		} catch(err) {
			console.log('File not ready:', filePath);
			await sleep(500);
		}
	}
}

function drawMask(canvas, ctx, mask) {
	// a mask path must have at least 3 point before it's usefull
	if (mask.length >= 3) {
		ctx.fillStyle = '#000'; // fill the mask with black
		ctx.beginPath();

		// set the startin point

		// draw the rest of the shape
		for (let i = 0; i < mask.length; ++i) {
			if (i == 0 || mask[i].start) {
				ctx.moveTo(mask[i].x * canvas.width, mask[i].y * canvas.height);
			} else {
				ctx.lineTo(mask[i].x * canvas.width, mask[i].y * canvas.height);
			}
		}

		ctx.closePath();
		ctx.fill();
	}
}
function drawDetections(canvas, ctx, detections) {	
	for (let i = 0; i < detections.length; ++i) {
		let det = detections[i];

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
}

function canvasToBase64(canvas) {
	const buffer = canvas.toBuffer('image/jpeg');
	var binary = '';
	var bytes = new Uint8Array(buffer);
	var len = bytes.byteLength;
	for (var i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}

	return btoa(binary);
}

async function sendCanvasToServer(canvas) {
	const requestData = {
		detector_name: config.get('doods.detectorName'),
		detect: config.get('doods.detect'),
		data: canvasToBase64(canvas),
	};

	console.log('Sending image to server');
	const result = await fetch(config.get('doods.url'), {
		method:"POST",
		body: JSON.stringify(requestData)
	});

	return await result.json();
}

async function processImage(filePath) {
	console.log('New image found: ', filePath);

	const img = await forceLoadImage(filePath);
	console.log('Image loaded');

	let canvasWidth = img.width;
	const aspect = img.height / img.width;

	if (config.has('canvasSize')) {
		canvasWidth = config.get('canvasSize');
	}

	const canvas = createCanvas(canvasWidth, canvasWidth * aspect);
	const ctx = canvas.getContext("2d");
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

	const mask = config.get('mask');
	drawMask(canvas, ctx, mask);

	const data = await sendCanvasToServer(canvas);
	let actions, detections, savePath;

	if (data.detections) {
		console.log(`Server came back with ${data.detections.length} objects detected`);

		actions = config.get('actions.result'); // actions to perform when an object was detected
		detections = data.detections;
		savePath = filePath;

		if (config.has('output.path')) {
			savePath = path.join(config.get('output.path'), path.basename(filePath));
		}

		// redraw image if the mask should not be drawn on final image
		if (!config.get('output.drawMask')) {
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		}

		drawDetections(canvas, ctx, detections);

		// save and alert if objects where detected
		const buffer = canvas.toBuffer('image/jpeg');
		await fs.writeFile(savePath, buffer);

		console.log('Edited image writen back');
	} else {
		console.log('Server came back without objects detected');
		actions = config.get('actions.empty'); // actions to perform when NO objects were detected
	}

	// perform the actions
	for (let i = 0; i < actions.length; ++i) {
		require('./' + path.join('actions', `${actions[i].module}.js`)).process(actions[i].options, filePath, savePath, detections);
	}
}

function onError(error) {
	console.error('Error happened: ', error);
}

function onFileAdded(filePath) {
	processImage(filePath).catch(onError);
}

const watchDir = config.get('watchDir');
const watcher = chokidar.watch(watchDir, { ignored: /^\./, persistent: true, ignoreInitial: true });

watcher
	.on('add', onFileAdded)
	.on('error', onError);

console.log('Started watching files:', watchDir);
