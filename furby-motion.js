const EventEmitter = require('events');

const GPIO = require('onoff').Gpio;
const pify = require('pify');
const _ = require('lodash');

const conf = { include: [ 'write' ] };

const timeout = pify((timeout, cb) => setTimeout(cb, timeout));

class FurbyMotion extends EventEmitter {
	constructor() {
		super();

		this.__motor = {
			inA: pify(new GPIO(5, 'low'), conf),
			inB: pify(new GPIO(6, 'low'), conf),
		};

		this.__home = pify(new GPIO(16, 'in', 'rising'));

		this.__decoder = {
			channelA: new GPIO(20, 'in', 'both'),
			channelB: new GPIO(21, 'in', 'both'),
		};


		this.__tail = pify(new GPIO(12, 'in', 'rising'), conf);

		this.__tail.watch(_.debounce(() => this.emit('tail'), 50));

		this.__home.watch(_.debounce(() => this.emit('home'), 50));

		this._position = 0;

		this.on('home', () => {
			this._position = 0;
		});

		this._chain = [];

		this.motorHome().run();
	}

	pause(milliseconds = 10) {
		this._chain.push(() => timeout(milliseconds));
		return this;
	}

	motorStep(count = 0) {
		this.motorReset();

		this._chain.push(() =>
			new Promise(resolve => {
				let move = (count > 0 ? this.__motor.inA : this.__motor.inB).write(1);

				let steps = 0;

				let step = () => {
					if (++steps >= count) {
						this.motorBrake().run().then(resolve);
						this.__decoder.channelA.unwatch(step);
					}
				};

				this.__decoder.channelA.watch(step);
			})
		);

		return this;
	}

	motorReset() {
		this._chain.push(() => Promise.all([
			this.__motor.inA.write(0),
			this.__motor.inB.write(0),
		]));

		return this;
	}

	motorForward(count = 0) {
		if (count >= 0) {
			return this.motorStep(count);
		}

		this.motorReset();
		this._chain.push(() => this.__motor.inA.write(1));

		return this;
	}


	motorReverse(count = 0) {
		if (count >= 0) {
			return this.motorStep(-count);
		}

		this.motorReset();
		this._chain.push(() => this.__motor.inB.write(1));

		return this;
	}

	motorBrake() {
		this._chain.push(() =>
			Promise
				.all([
					this.__motor.inA.write(1),
					this.__motor.inB.write(1),
				])

				.then(() => this.pause(100).motorReset().run())
		);

		return this;
	}

	motorHome(direction = 'forward') {
		this._chain.push(() =>
			this.__home.read().then(value => {
				// Return if already at the home position
				if (value == 1) {
					return Promise.resolve();
				}

				return new Promise(resolve => {
					this.once('home', () => 
						this.motorBrake()
							.motorHome(direction === 'forward' ? 'reverse' : 'forward')
							.run()
							.then(resolve)
					);

					if (direction === 'forward') {
						return this.motorForward().run();
					} else {
						return this.motorReverse().run();
					}
				});
			})
		);

		return this;
	}

	run() {
		let last = Promise.resolve();

		this._chain.forEach(item => last = last.then(item));

		this._chain = [];

		return last;
	}
}
