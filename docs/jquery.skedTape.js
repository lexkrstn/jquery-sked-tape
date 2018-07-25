;(function($){
var SkedTape = function(opts) {
	$.extend(this, opts);

	this.$el = opts && opts.el ? $(opts.el) : $('<div/>');
	this.el = opts.el instanceof $ ? opts.el[0] : opts.el;

	this.locations = {};
	this.events = [];
	this.lastEventId = 0;

	this.$el.on('click', '.sked-tape__event', $.proxy(this.handleEventClick, this));
	this.$el.on('contextmenu', '.sked-tape__event', $.proxy(this.handleEventContextMenu, this));
	this.$el.on('click', '.sked-tape__timeline-wrap', $.proxy(this.handleTimelineClick, this));
	this.$el.on('contextmenu', '.sked-tape__timeline-wrap', $.proxy(this.handleTimelineContextMenu, this));
	this.$el.on('keydown', '.sked-tape__time-frame', $.proxy(this.handleKeyDown, this));
	this.$el.on('wheel', '.sked-tape__time-frame', $.proxy(this.handleWheel, this));
};

SkedTape.prototype = {
	setTimespan: function(start, end) {
		if (!isValidTimeRange(start, end)) {
			throw new Error('Invalid time range: ' + JSON.stringify([start, end]));
		}
		this.start = floorHours(start);
		this.end = ceilHours(end);
		return this;
	},
	/**
	 * A shorthand for `setTimespan()` that sets timespan between some
	 * specified hours (optional) of a particular date.
	 */
	setDate: function(date, minHours, maxHours) {
        var midnight = new Date(date);
        midnight.setHours(0, 0, 0, 0);
		var start = new Date(midnight);
		start.setHours(minHours || 0);
		if (maxHours && maxHours != 24) {
			var end = new Date(midnight.getTime());
			end.setHours(maxHours);
		} else {
			var end = new Date(midnight.getTime() + MS_PER_DAY);
		}
        return this.setTimespan(start, end);
	},
	getZoom: function() {
		return this.zoom;
	},
	setZoom: function(zoom) {
		zoom = zoom || 1;
		if (zoom < 1) {
			this.zoom = 1;
			return this;
		}
		if (zoom > this.maxZoom) {
			this.zoom = this.maxZoom;
			return this;
		}
		this.zoom = zoom;
		var $canvas = this.$el.find('.sked-tape__time-canvas');
		if ($canvas.length) {
			var minWidth = $canvas.data('orig-min-width') * zoom;
			$canvas.css('min-width', Math.round(minWidth) + 'px');
		}
		return this;
	},
	resetZoom: function() {
		return this.setZoom();
	},
	zoomIn: function(inc) {
		return this.setZoom(this.zoom + (inc || this.zoomStep));
	},
	zoomOut: function(dec) {
		return this.setZoom(this.zoom - (dec || this.zoomStep));
	},
	locationExists: function(loc) {
		return Object.keys(this.locations).indexOf(loc + '') >= 0;
    },
    setLocations: function(locations, opts) {
		this.locations = $.extend({}, locations);
		return (!opts || opts.update) ? this.update() : this;
    },
	addLocations: function(locations, opts) {
		$.extend(this.locations, locations);
		return (!opts || opts.update) ? this.update() : this;
    },
    addLocation: function(id, name, opts) {
        this.locations[id] = name;
        return (!opts || opts.update) ? this.update() : this;
    },
    removeLocation: function(id, opts) {
		for (var i = this.events.length - 1; i >= 0; --i) {
			if (this.events[i].location == id) {
				this.events.splice(i, 1);
			}
		}
        delete this.locations[id];
        return (!opts || opts.update) ? this.update() : this;
	},
	getLocation: function(id) {
		return this.locations[id];
	},
	collide(event) {
		var collided = null;
		this.events.some(function(iEvent) {
			if (event.location == iEvent.location && intersects(event, iEvent)) {
				collided = iEvent;
				return true;
			}
			return false;
		});
		return collided;
	},
	addEvent: function(entry, opts) {
		if (!this.locationExists(entry.location)) {
			throw new Error('Unknown location');
		}

		var start = entry.start instanceof Date ? entry.start : new Date(entry.start);
		var end = entry.end instanceof Date ? entry.end : new Date(entry.end);

		if (!isValidTimeRange(start, end)) {
			throw new Error('Invalid time range: ' +
				JSON.stringify([entry.start, entry.end]));
		}

		var newEvent = {
			id: ++this.lastEventId,
			name: entry.name,
			location: entry.location + '',
			start: start,
			end: end,
			data: entry.data ? $.extend({}, entry.data) : null,
			url: entry.url || false,
			disabled: entry.disabled || false,
			userData: entry.userData
		};

		var collidedId = this.collide(newEvent);
		if (collidedId) {
			throw new SkedTape.CollisionError(collidedId);
		}

		this.events.push(newEvent);

		return (this.$timeline && (!opts || opts.update)) ? this.update() : this;
	},
	addEvents: function(events) {
		events.forEach(function(event) {
			this.addEvent(event, {update: false});
		}, this);
		return this.update();
    },
    setEvents: function(entries) {
        return this.removeAllEvents().addEvents(entries);
    },
	removeEvent: function(eventId, opts) {
		$.each(this.events, $.proxy(function(i, event) {
			if (event.id == eventId) {
				this.events.splice(i, 1);
				return false;
			}
		}, this));
		return (this.$timeline && (!opts || opts.update)) ? this.update() : this;
    },
    removeAllEvents: function() {
        this.$el.find('.sked-tape__event, .sked-tape__gap').remove();
        this.events = [];
        return this;
    },
	getEvents: function() {
		return this.events;
	},
	getEvent: function(id) {
		var found = null;
		$.each(this.events, $.proxy(function(i, event) {
			if (event.id == id) {
				found = event;
				return false;
			}
		}, this));
		return found;
	},
	renderAside: function() {
		var $aside = $('<div class="sked-tape__aside"/>');
		$('<div class="sked-tape__caption"/>').text(this.caption).appendTo($aside);
		var $ul = $('<ul/>').appendTo($aside);
		$.each(this.locations, function(id, name) {
			var $span = $('<span/>').text(name);
			$('<li/>')
				.attr('title', name)
				.append($span)
				.appendTo($ul);
		});
		this.$el.append($aside);
	},
	renderTimeWrap: function(oldScroll) {
		var $hours = this.renderHours();
		var $wrap = $('<div class="sked-tape__time-wrap"/>').appendTo(this.$el);
		this.$frame = $('<div class="sked-tape__time-frame" tabindex="0"/>')
			.appendTo($wrap);
		var $canvas = $('<div class="sked-tape__time-canvas"/>')
			.append($hours)
			.appendTo(this.$frame);
		oldScroll && this.$frame.scrollLeft(oldScroll);
		var $timelineWrap = $('<div class="sked-tape__timeline-wrap"/>')
			.append(this.renderTimeRows())
			.append(this.renderGrid())
			.append(this.renderTimeIndicator());
		var minWidth = $canvas[0].scrollWidth;
		$canvas
			.css('min-width', Math.round(minWidth * this.zoom) + 'px')
			.data('orig-min-width', minWidth)
			.append($timelineWrap)
			.append($hours.clone());
		if (this.showDates) {
			$canvas.prepend(this.renderDates());
		}
	},
	renderDates: function() {
		var $ul = $('<ul class="sked-tape__dates"/>');
		var firstMidnight = getMidnightAfter(this.start);
		var lastMidnight = getMidnightBefore(this.end);
		var queue = [];
		if (firstMidnight > lastMidnight) {
			// The range is within the same day
			queue.push({weight: 1, text: formatDate(this.start)})
		} else {
			queue.push({
				weight: getMsToMidnight(this.start) / MS_PER_DAY,
				text: formatDate(this.start)
			});
			for (var day = new Date(firstMidnight); day < lastMidnight;) {
				day.setTime(day.getTime() + 1000);
				queue.push({weight: 1, text: formatDate(day)});
				day.setTime(day.getTime() + MS_PER_DAY - 1000);
			}
			queue.push({
				weight: getMsFromMidnight(this.end) / MS_PER_DAY,
				text: formatDate(this.end)
			});
		}
		var totalWeight = queue.reduce(function(total, item) {
			return total + item.weight;
		}, 0);
		queue.forEach(function(item) {
			$('<li/>')
				.css('width', (item.weight / totalWeight * 100).toFixed(10) + '%')
				.attr('title', item.text)
				.appendTo($ul);
		});
		return $ul;
	},
	renderHours: function() {
		var $ul = $('<ul/>');

		var tick = new Date(this.start);
		while (tick.getTime() <= this.end.getTime()) {
			var hour = tick.getHours();

			var $time = $('<time/>')
				.attr('datetime', tick.toISOString())
				.text(formatHour(hour === 24 ? 0 : hour));
			$('<li/>').append($time).appendTo($ul);

			tick.setTime(tick.getTime() + 60*60*1000);
		}

		var $li = $ul.children();
		$li.not(':last-child').width(100 / ($li.length - 1) + '%');

		return $('<div class="sked-tape__hours"/>').append($ul);
	},
	renderGrid: function() {
		var $ul = $('<ul class="sked-tape__grid"/>');
		var tick = new Date(this.start);
		while (tick.getTime() < this.end.getTime()) {
			$('<li/>').appendTo($ul);
			tick.setTime(tick.getTime() + 60*60*1000);
		}
		var $li = $ul.children();
		$li.width(100 / $li.length + '%');
		return $ul;
	},
	renderTimeRows: function() {
		this.$timeline = $('<ul class="sked-tape__timeline"/>');
		var events = this.events.sort($.proxy(function(a, b) {
			return a.start.getTime() - b.start.getTime();
		}, this));
		$.each(this.locations, $.proxy(function(locationId) {
			var $li = $('<li class="sked-tape__event-row"/>')
				.data('locationId', locationId)
				.appendTo(this.$timeline);
			var lastEndTime = 0, lastEnd;
			events.forEach(function(event) {
				var belongs = event.location == locationId;
				var visible = event.end > this.start && event.start < this.end;
				if (belongs && visible) {
					var gap = event.start.getTime() - lastEndTime;
					if (gap >= this.minGapTime && gap <= this.maxGapTime) {
						$li.append(this.renderGap(gap, lastEnd, event.start));
					}
					lastEnd = event.end;
					lastEndTime = lastEnd.getTime();
					$li.append(this.renderEvent(event));
					if (this.minGapHiTime !== false && gap >= 0 && gap < this.minGapHiTime) {
						$li.children()
							.filter(':eq(-1), :eq(-2)')
							.addClass('sked-tape__event--low-gap');
					}
				}
			}, this);
		}, this));
		return this.$timeline;
	},
	renderGap(gap, start, end) {
		var block = {start: start, end: end};
		return $('<span class="sked-tape__gap"/>')
			.css({
				width: this.computeEventWidth(block),
				left: this.computeEventOffset(block)
			})
			.text(Math.round(gap / MS_PER_MINUTE));
	},
	renderEvent: function(event) {
		var self = this;
		// Create event node
		if (event.url && !event.disabled) {
			var $event = $('<a/>').attr('href', event.url);
		} else {
			var $event = $('<div/>');
		}
		$event.addClass('sked-tape__event');
		if (event.class) {
			$event.addClass(event.class);
		}
		if (event.disabled) {
			$event.addClass('sked-tape__event--disabled');
		}
		$event
			.attr('title', event.name)
			.css({
				width: this.computeEventWidth(event),
				left: this.computeEventOffset(event)
			});
		// Append the center aligner node with text context
		var $center = $('<div class="sked-tape__center"/>')
			.text(event.name)
			.appendTo($event);
		if (this.showEventTime || this.showEventDuration) {
			var html = $center.html();
			if (this.showEventTime) {
				html += '<br>' + formatHoursMinutes(event.start)
					+ ' - ' + formatHoursMinutes(event.end);
			}
			if (this.showEventDuration) {
				html += '<br>' + formatDuration(event.start, event.end);
			}
			$center.html(html);
		}
		// Bind data-*
		$event.data($.extend({}, {eventId: event.id}, event.data));
		// Measure minimum content width to detect whether to attach popover further
		var $loose = $event.clone()
			.css({
				width: '',
				left: '-10000px',
				top: '-10000px'
			})
			.appendTo(document.body);
		$event.data('min-width', $loose.outerWidth());
		$loose.remove();

		return $event;
	},
	computeEventWidth: function(event) {
		// Clamp to timeline edge
		var eventEnd = this.end < event.end ? this.end : event.end;
		var durationHours = getDurationHours(event.start, eventEnd);
		return durationHours / getDurationHours(this.start, this.end) * 100 + '%';
	},
	computeEventOffset: function(event) {
		var hoursBeforeEvent =  getDurationHours(this.start, event.start);
		return hoursBeforeEvent /  getDurationHours(this.start, this.end) * 100 + '%';
	},
	renderTimeIndicator: function() {
		return this.$timeIndicator = $('<div class="sked-tape__indicator"/>').hide();
	},
	updateTimeIndicatorPos: function() {
		var now = new Date().getTime();
		var start = this.start.getTime();
		var end = this.end.getTime();
		if (now >= start && now <= end) {
			var offset = 100 * (now - start) / (end - start) + '%';
			this.$timeIndicator.show().css('left', offset);
		} else {
			this.$timeIndicator.hide();
		}
	},
	cleanup: function() {
		if ($.fn.popover) {
			this.$el.find('.sked-tape__event')
				.popover(TWBS_MAJOR >= 4 ? 'dispose' : 'destroy');
		}
		if (this.indicatorTimeout) {
			clearInterval(this.indicatorTimeout);
			delete this.indicatorTimeout;
		}
	},
	render: function(opts) {
		var oldScrollLeft = opts && opts.preserveScroll
			&& this.$frame && this.$frame.scrollLeft();

		this.cleanup();
		this.$el.empty().addClass('sked-tape');
		if (this.showDates) {
			this.$el.addClass('sked-tape--has-dates');
		}

		this.renderAside();
		this.renderTimeWrap(oldScrollLeft);
		this.updateTimeIndicatorPos();

		this.indicatorTimeout = setInterval($.proxy(function() {
			this.updateTimeIndicatorPos();
		}, this), 1000);

		setTimeout($.proxy(function() {
			this.$el.find('.sked-tape__event').each(function() {
				var $entry = $(this);
				if ($entry.width() >= $entry.data('min-width')) return;
				if ($.fn.popover) {
					$entry.popover({
						trigger: 'hover',
						title: '--',
						content: $entry.find('.sked-tape__center').html(),
						html: true,
						template: '<div class="popover" role="tooltip"><div class="arrow"></div><div class="popover-body"></div></div>'	,
						placement: parseInt($entry[0].style.left) < 50 ? 'right' : 'left'
					});
				}
			});
		}, this), 0);

		return this;
	},
	update: function() {
		return this.render({preserveScroll: true});
	},
	makeMouseEvent: function(type, e, props) {
		var scalar = (e.pageX - this.$timeline.offset().left) / this.$timeline.width();
		var time = this.start.getTime() + scalar * (this.end.getTime() - this.start.getTime());
		var locationId = false;
		if (props.detail.event) {
			locationId = props.detail.event.location;
		} else {
			this.$el.find('.sked-tape__event-row').each(function() {
				var top = $(this).offset().top;
				var bottom = top + $(this).height();
				if (e.pageY >= top && e.pageY <= bottom) {
					locationId = $(this).data('locationId');
					return false;
				}
			});
		}
		return $.Event(type, $.extend({}, props, {
			relatedTarget: e.currentTarget,
			clientX: e.clientX,
			clientY: e.clientY,
			offsetX: e.offsetX,
			offsetY: e.offsetY,
			pageX: e.pageX,
			pageY: e.pageY,
			screenX: e.screenX,
			screenY: e.screenY,
			detail: $.extend({
				locationId: locationId,
				date: new Date(Math.round(time))
			}, props.detail)
		}));
	},
	handleEventClick: function(e) {
		var eventId = $(e.currentTarget).data('eventId');
		var event = this.getEvent(eventId);
		var jqEvent = this.makeMouseEvent('skedtape:event:click', e, {
			detail: { component: this, event: event }
		});
		this.$el.trigger(jqEvent, [this]);
	},
	handleEventContextMenu: function(e) {
		e.preventDefault();
		var eventId = $(e.currentTarget).data('eventId');
		var event = this.getEvent(eventId);
		var jqEvent = this.makeMouseEvent('skedtape:event:contextmenu', e, {
			detail: { component: this, event: event }
		});
		this.$el.trigger(jqEvent, [this]);
	},
	handleTimelineClick: function(e) {
		if (eventFromEvent(e)) return;
		var jqEvent = this.makeMouseEvent('skedtape:timeline:click', e, {
			detail: { component: this }
		});
		this.$el.trigger(jqEvent, [this]);
	},
	handleTimelineContextMenu: function(e) {
		if (eventFromEvent(e)) return;
		e.preventDefault();
		var jqEvent = this.makeMouseEvent('skedtape:timeline:contextmenu', e, {
			detail: { component: this }
		});
		this.$el.trigger(jqEvent, [this]);
	},
	handleKeyDown: function(e) {
		if (e.key === '+') {
			this.zoomIn();
		}
		else if (e.key === '-') {
			this.zoomOut();
		}
	},
	handleWheel: function(e) {
		if (e.ctrlKey) {
			e.stopPropagation();
			e.preventDefault();
			if (e.originalEvent.deltaY < 0) {
				this.zoomIn();
			} else {
				this.zoomOut();
			}
		} else if (!e.shiftKey) {
			var delta = e.originalEvent.deltaY > 0 ? 1 : -1;
			delta *= this.$frame.width() * 0.9;
			if (this.$frame.queue().length) {
				var scrollLeft = this.$frame.scrollLeft();
				delta += this.$frame.finish().scrollLeft() - scrollLeft;
				this.$frame.scrollLeft(scrollLeft);
			}
			this.$frame.animate({ scrollLeft: '+=' + delta }, 200);
		}
	}
};

SkedTape.CollisionError = function(id) {
	this.message = 'Collision with entry #' + id;
	this.eventId = id;
    // Use V8's native method if available, otherwise fallback
    if ("captureStackTrace" in Error)
        Error.captureStackTrace(this, SkedTape.CollisionError);
    else
        this.stack = (new Error()).stack;
}
SkedTape.CollisionError.prototype = Object.create(Error.prototype);
SkedTape.CollisionError.prototype.name = "SkedTape.CollisionError";
SkedTape.CollisionError.prototype.constructor = SkedTape.CollisionError;

var TWBS_MAJOR = parseInt($.fn.popover.Constructor.VERSION.charAt(0), 10);
var SECS_PER_DAY = 24 * 60 * 60;
var MS_PER_DAY = SECS_PER_DAY * 1000;
var MS_PER_MINUTE = 60 * 1000;
var MS_PER_HOUR = 60 * MS_PER_MINUTE;

function eventFromEvent(e) {
	return !!$(e.target).closest('.sked-tape__event').length;
}
function isValidTimeRange(start, end) {
	var correctTypes = start instanceof Date && end instanceof Date;
	var correctOrder = start <= end;
	return correctTypes && correctOrder;
}
function getDurationHours(start, end) {
	return (end.getTime() - start.getTime()) / 1000 / 60 / 60;
}
function formatHour(hour) {
	var prefix = hour < 10 ? '0' : '';
	return prefix + hour + ':00';
}
function formatHoursMinutes(date) {
	var h = date.getHours();
	var m = date.getMinutes();
	return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
}
function formatDuration(start, end) {
	var format = '';
	var ms = (end.getTime() - start.getTime());
	if (ms >= MS_PER_HOUR) {
		format += Math.floor(ms / MS_PER_HOUR) + 'ч.';
	}
	ms %= MS_PER_HOUR;
	if (ms >= MS_PER_MINUTE) {
		format += (format ? ' ' : '') + Math.floor(ms / MS_PER_MINUTE) + 'мин.';
	}
	return format;
}
function formatDate(date) {
	var d = date.getDate();
	var m = date.getMonth() + 1;
	var y = date.getFullYear();
	return (d < 10 ? '0' + d : d) + '.' + (m < 10 ? '0' + m : m) + '.' + y;
}
function getMsFromMidnight(d) {
	var secs = d.getHours()*60*60 + d.getMinutes()*60 + d.getSeconds();
	return secs * 1000 + d.getMilliseconds();
}
function getMsToMidnight(d) {
	return MS_PER_DAY - getMsFromMidnight(d);
}
function getMidnightAfter(d) {
	d = new Date(d);
	d.setTime(d.getTime() + getMsToMidnight(d));
	return d;
}
function getMidnightBefore(d) {
	d = new Date(d);
	d.setTime(d.getTime() - getMsFromMidnight(d));
	return d;
}
function intersects(a, b) {
	var min = a.start < b.start  ? a : b;
	var max = min === a ? b : a;
	return min.end > max.start;
}
function floorHours(date) {
    var floor = new Date(date);
    floor.setHours(date.getHours(), 0, 0, 0);
    return floor;
}
function ceilHours(date) {
    var floor = floorHours(date);
    if (floor < date) { // not equal
        floor.setTime(floor.getTime() + MS_PER_HOUR);
    }
    return floor;
}

// ---------------------------- jQuery plugin ----------------------------------

$.fn.skedTape = function(opts) {
    var cmd = opts && (typeof opts === 'string' || opts instanceof String) ? opts : '';
    opts = opts && !cmd && typeof opts === 'object' ? $.extend({}, opts) : {};
    var args = cmd ? Array.prototype.slice.call(arguments, 1) : [];
    return this.each(function() {
        var obj = $(this).data($.fn.skedTape.dataKey);
        if (!obj) {
            if (cmd) {
                throw new Error('SkedTape plugin hadn\'t been initialized but used');
			}
			var objOpts = $.extend({}, $.fn.skedTape.defaults, opts, {
				el: this
			});
			delete objOpts.locations;
			delete objOpts.events;
			delete objOpts.start;
			delete objOpts.end;
			delete objOpts.date;
            obj = new SkedTape(objOpts);
			opts.start && opts.end && obj.setTimespan(opts.start, opts.end);
			opts.date && obj.setDate(opts.date);
			opts.locations && obj.setLocations(opts.locations);
			opts.events && obj.setEvents(opts.events);
			$(this).data($.fn.skedTape.dataKey, obj);
			obj.render();
        } else if (cmd) {
            switch (cmd) {
                case 'destroy':
                    obj.destroy();
                    $(this).removeData($.fn.skedTape.dataKey).remove();
                    break;
                case 'addEvent':
                case 'addEvents':
                case 'removeEvent':
                case 'setEvents':
                case 'removeAllEvents':
                case 'setLocations':
                case 'addLocation':
                case 'addLocations':
                case 'removeLocation':
                case 'setTimespan':
                case 'setDate':
                case 'zoomIn':
                case 'zoomOut':
                case 'setZoom':
                case 'resetZoom':
                    obj[cmd].apply(obj, args);
                    break;
                default:
                    throw new Error('SkedTape plugin cannot recognize command');
            }
        } else {
            throw new Error('SkedType plugin has been initialized yet');
        }
    });
};

$.fn.skedTape.dataKey = '__SkedTape';

$.fn.skedTape.defaults = {
	caption: '',
	maxZoom: 10,
	/**
	 * Default zooming up and down increment/decrement value.
	 */
	zoomStep: 0.5,
	/**
	 * Initial zoom level. Minimum possible value is 1.
	 */
	zoom: 1,
	/**
	 * Whether to show from-to dates in entries.
	 */
	showEventTime: false,
	/**
	 * Whether to show duration in entries.
	 */
	showEventDuration: false,
	/**
	 * Whether to show dates bar.
	 */
	showDates: true,
	/**
	 * Minimum gap between entries to show minutes.
	 */
	minGapTime: 1 * MS_PER_MINUTE,
	/**
	 * Maximum gap between entries to show minutes.
	 */
	maxGapTime: 30 * MS_PER_MINUTE,
	/**
	 * Minimum gap to DO NOT highlight adjacent entries.
	 */
	minGapHiTime: false
};

}(jQuery));
