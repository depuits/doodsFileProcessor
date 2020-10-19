const fs = require('fs/promises');

/*
options: action options passed from config
oldPath: path of the original image file
newPath: path of the image file with detections (undefined if no detections where found)
detections: objects detected on the image (undefined if no detections where found)
*/
exports.process = async function(options, oldPath, newPath, detections) {
	await fs.unlink(oldPath);
};
