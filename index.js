const path = require('path');
const fs = require('fs/promises');
const fetch = require('node-fetch');
const chokidar = require('chokidar');
const { createCanvas, loadImage } = require('canvas');
const config = require('config');

async function ProcessImage(filePath) {
	console.log('New image found: ', filePath);
	const img = await loadImage(filePath);
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
	// a mask path must have at least 3 point before it's usefull
	if (mask.length >= 3) {
		ctx.fillStyle = '#000'; // fill the mask with black
		ctx.beginPath();

		// set the startin point
		ctx.moveTo(mask[0][0] * canvas.width, mask[0][1] * canvas.height);

		// draw the rest of the shape
		for (let i = 1; i < mask.length; ++i) {
			ctx.lineTo(mask[i][0] * canvas.width, mask[i][1] * canvas.height);
		}

		ctx.closePath();
		ctx.fill();
	}

	const dataUrl = canvas.toDataURL();
	const metaIndex = dataUrl.indexOf(',');
	const base64 = dataUrl.substring(metaIndex + 1);

	const requestData = {
		detector_name: config.get('doods.detectorName'),
		detect: config.get('doods.detect'),
		data: base64,
	};

	console.log('Sending image to server');
	const result = await fetch(config.get('doods.url'), {
		method:"POST",
		body: JSON.stringify(requestData)
	});

	// redraw image if the mask should not be drawn on final image
	if (!config.get('output.drawMask')) {
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
	}

	const data = await result.json();
	let actions, detections, savePath;

	if (data.detections) {
		console.log(`Server came back with ${data.detections.length} objects detected`);

		actions = config.get('actions.result'); // actions to perform when an object was detected
		detections = data.detections;
		savePath = filePath;

		if (config.has('output.path')) {
			savePath = path.join(config.get('output.path'), path.basename(filePath));
		}

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

function OnError(error) {
	console.error('Error happened: ', error);
}

function OnFileAdded(filePath) {
	ProcessImage(filePath).catch(OnError);
}

const watchDir = config.get('watchDir');
const watcher = chokidar.watch(watchDir, { ignored: /^\./, persistent: true, ignoreInitial: true });

watcher
	.on('add', OnFileAdded)
	.on('error', OnError);

console.log('Started watching files:', watchDir);
