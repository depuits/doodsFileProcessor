const mqtt = require('async-mqtt');
var client = undefined;

/*
options: action options passed from config
oldPath: path of the original image file
newPath: path of the image file with detections (undefined if no detections where found)
detections: objects detected on the image (undefined if no detections where found)
*/
exports.process = async function(options, oldPath, newPath, detections) {
	try {
		if (!client) {
			console.log('Connecting to mqtt server');
			const mqttConfig = Object.assign({}, options.connection); // we copy the config because it must be editable
			client = await mqtt.connectAsync(mqttConfig);
		}

		var payload = detections.map(det => det.label).join();

		console.log('publishing message:', payload);
		await client.publish(options.topic, payload);		
	} catch(err) {
		console.error('Error in sending mqtt message;', err);
	}

};
