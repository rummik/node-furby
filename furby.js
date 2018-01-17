const FurbyMotion = require('./furby-motion');

module.exports = class Furby extends FurbyMotion {
	constructor() {
		super();

		this.blink();
	}

	closeEyes() {
		return this.motorHome().motorForward(330).run();
	}

	blink() {
		return this.closeEyes()
			.then(() => this.motorHome('reverse').run());
	}

	sleep() {
		return this.closeEyes();
	}

	talk() {
		return this.motorHome()
			.motorForward(30).motorReverse(70)
			.motorForward(70).motorReverse(70)
			.motorForward(70).motorReverse(70)
			.run()
			.then(() => this.blink());
	}
};
