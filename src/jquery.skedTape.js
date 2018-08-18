;(function($){
var SkedTape = function(opts) {
	$.extend(this, opts);

	this.$el = opts && opts.el ? $(opts.el) : $('<div/>');
	this.el = opts.el instanceof $ ? opts.el[0] : opts.el;

	this.locations = [];
	this.events = [];
	this.lastEventId = 0;
	this.format = $.extend({}, SkedTape.defaultFormatters, (opts && opts.formatters) || {});
	this.tzOffset = !opts || opts.tzOffset == undefined ? -(new Date).getTimezoneOffset() : opts.tzOffset;

	this.$el.on('click', '.sked-tape__event', $.proxy(this.handleEventClick, this));
	this.$el.on('contextmenu', '.sked-tape__event', $.proxy(this.handleEventContextMenu, this));
	this.$el.on('click', '.sked-tape__timeline-wrap', $.proxy(this.handleTimelineClick, this));
	this.$el.on('contextmenu', '.sked-tape__timeline-wrap', $.proxy(this.handleTimelineContextMenu, this));
	this.$el.on('mousemove', '.sked-tape__timeline-wrap', $.proxy(this.handleMouseMove, this));
	this.$el.on('keydown', '.sked-tape__time-frame', $.proxy(this.handleKeyDown, this));
	this.$el.on('wheel', '.sked-tape__time-frame', $.proxy(this.handleWheel, this));
	this.$el.on('click', '.sked-tape__intersection', $.proxy(this.handleIntersectionClick, this));
	this.$el.on('contextmenu', '.sked-tape__intersection', $.proxy(this.handleIntersectionContextMenu, this));
};

SkedTape.defaultFormatters = {
	date: function (date, endian, delim) {
		endian = endian || 'm';
		var nums = date.toISOString().substring(0, 10).split('-');
		nums = endian === 'l' ? nums.reverse() : nums;
		nums = endian === 'm' ? [parseInt(nums[1]), parseInt(nums[2]), nums[0]] : nums;
		return nums.join(delim || (endian === 'm' ? '/' : '.'));
	},
	duration: function (start, end, opts) {
		var ms = end.getTime() - start.getTime();
		var h = Math.floor(ms / MS_PER_HOUR);
		var m = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
		var hrs = (opts && opts.hrs) || 'hrs';
		var min = (opts && opts.min) || 'min';
		var format = h ? h + hrs : '';
		format += h && m ? ' ' : '';
		format += m ? m + min : '';
		return format;
	},
	hours: function (hours) {
		return (hours < 10 ? '0' : '') + hours + ':00';
	},
	time: function (date) {
		var h = date.getUTCHours();
		var m = date.getUTCMinutes();
		return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
	}
};

SkedTape.prototype = {
	constructor: SkedTape,
	setTimespan: function(start, end, opts) {
		if (!isValidTimeRange(start, end)) {
			throw new Error('Invalid time range: ' + JSON.stringify([start, end]));
		}
		this.start = floorHours(start);
		this.end = ceilHours(end);
		return this.updateUnlessOption(opts);
	},
	/**
	 * A shorthand for `setTimespan()` that sets timespan between some
	 * specified hours (optional) of a particular date.
	 */
	setDate: function(date, minHours, maxHours) {
        var midnight = new Date(date);
        midnight.setUTCHours(0, 0, 0, 0);
		var start = new Date(midnight);
		start.setUTCHours(minHours || 0);
		if (maxHours && maxHours != 24) {
			var end = new Date(midnight.getTime());
			end.setUTCHours(maxHours);
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
	locationExists: function(id) {
		var exists = false;
		$.each(this.locations, function(i, location) {
			if (location.id == id) {
				exists = true;
				return false;
			}
		});
		return exists;
    },
    setLocations: function(locations, opts) {
		this.events = [];
		this.locations = locations;
		return this.updateUnlessOption(opts);
    },
	addLocations: function(locations, opts) {
		this.locations = this.locations.concat(locations);
		return this.updateUnlessOption(opts);
    },
    addLocation: function(location, opts) {
        this.locations.append(location);
        return this.updateUnlessOption(opts);
    },
    removeLocation: function(id, opts) {
		// Remove corresponding events
		for (var i = this.events.length - 1; i >= 0; --i) {
			if (this.events[i].location == id) {
				this.events.splice(i, 1);
			}
		}
		// Remove the location
		for (var i = 0; i < this.locations.length; ++i) {
			if (this.locations[i].id == id) {
				this.locations.splice(i, 1);
				break;
			}
		}
        return this.updateUnlessOption(opts);
	},
	getLocation: function(id) {
		for (var i = 0; i < this.locations.length; ++i) {
			if (this.locations[i].id == id) {
				return this.locations[i];
			}
		}
		return null;
	},
	getLocations: function() {
		var locations = this.locations;
		if (this.sorting && this.orderBy === 'name') {
			locations = locations.sort(function(a, b) {
				a = a.name.toLocaleLowerCase();
				b = b.name.toLocaleLowerCase();
				return a.localeCompare(b);
			});
		}
		else if (this.sorting && this.orderBy === 'order') {
			locations = locations.sort(function(a, b) {
				return (a.order || 0) - (b.order || 0);
			});
		}
		return locations;
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
			throw new Error('Unknown location #' + entry.location);
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
			userData: $.extend({}, entry.userData || {})
		};

		if (!opts || !opts.allowCollisions) {
			var collided = this.collide(newEvent);
			if (collided) {
				throw new SkedTape.CollisionError(collided.id);
			}
		}

		this.events.push(newEvent);

		this.updateUnlessOption(opts);

		return newEvent;
	},
	addEvents: function(events, opts) {
		events.forEach(function(event) {
			this.addEvent(event, $.extend({}, {update: false}, opts));
		}, this);
		return this.updateUnlessOption(opts);
    },
    setEvents: function(entries, opts) {
        return this.removeAllEvents(opts).addEvents(entries, opts);
    },
	removeEvent: function(eventId, opts) {
		$.each(this.events, $.proxy(function(i, event) {
			if (event.id == eventId) {
				this.events.splice(i, 1);
				return false;
			}
		}, this));
		return this.updateUnlessOption(opts);
    },
    removeAllEvents: function(opts) {
        this.$el.find('.sked-tape__event, .sked-tape__gap').remove();
        this.events = [];
        return this.updateUnlessOption(opts);
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
	isEditMode: function() {
		return this.editMode;
	},
	enterEditMode: function() {
		this.editMode = true;
		return this;
	},
	leaveEditMode: function() {
		this.isAdding() && this.cancelAdding();
		this.editMode = false;
		return this;
	},
	startAdding: function(dummyEvent) {
		this.dummyEvent = dummyEvent;
		this.moveDummyEvent(this.lastPicked);
		this.updateDummyEvent();
		return this.rerenderLocations();
	},
	cancelAdding: function() {
		if (this.dummyEvent) {
			// Add the dragged event back on the timeline
			var draggedEvent = this.dummyEvent.draggedEvent;
			if (draggedEvent) {
				this.addEvent(draggedEvent);
			}
			// Delete the dummy
			delete this.dummyEvent;
		}
		if (this.$dummyEvent) {
			this.$dummyEvent.remove();
			delete this.$dummyEvent;
			this.$el.trigger('skedtape:event:addingCanceled');
		}
		return this.rerenderLocations();
	},
	isAdding: function() {
		return !!this.dummyEvent;
	},
	rerenderLocations: function() {
		this.$locations.empty().append(this.renderLocations());
		return this;
	},
	renderLocations: function() {
		var $frag = $(document.createDocumentFragment());
		$.each(this.getLocations(), $.proxy(function(i, location) {
			var $span = $('<span/>').text(location.name);
			$('<li class="sked-tape__location"/>')
				.attr('title', location.name)
				.append($span)
				.appendTo($frag);
			if (this.isAdding()) {
				var canAdd = this.canAddIntoLocation(location, this.dummyEvent);
				this.postRenderLocation($span, location, canAdd);
			}
		}, this));
		return $frag;
	},
	postRenderLocation: function($el, location, canAdd) {
		$el.parent()
			.toggleClass('sked-tape__location--permitted', canAdd)
			.toggleClass('sked-tape__location--forbidden', !canAdd);
	},
	renderAside: function() {
		var $aside = $('<div class="sked-tape__aside"/>');
		$('<div class="sked-tape__caption"/>').text(this.caption).appendTo($aside);
		this.$locations = $('<ul class="sked-tape__locations"/>')
			.append(this.renderLocations())
			.appendTo($aside);
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
			queue.push({weight: 1, text: this.format.date(this.start)})
		} else {
			queue.push({
				weight: getMsToMidnight(this.start) / MS_PER_DAY,
				text: this.format.date(this.start)
			});
			for (var day = new Date(firstMidnight); day < lastMidnight;) {
				day.setTime(day.getTime() + 1000);
				queue.push({weight: 1, text: this.format.date(day)});
				day.setTime(day.getTime() + MS_PER_DAY - 1000);
			}
			queue.push({
				weight: getMsFromMidnight(this.end) / MS_PER_DAY,
				text: this.format.date(this.end)
			});
		}
		var totalWeight = queue.reduce(function(total, item) {
			return total + item.weight;
		}, 0);
		var duration = this.end.getTime() - this.start.getTime();
		queue.forEach(function(item) {
			var proportion = item.weight / totalWeight;
			$('<li/>')
				.css('width', (proportion * 100).toFixed(10) + '%')
				.attr('title', item.text)
				.addClass('sked-tape__date')
				.toggleClass('sked-tape__date--short', proportion * duration <= SHORT_DURATION)
				.appendTo($ul);
		});
		return $ul;
	},
	renderHours: function() {
		var $ul = $('<ul/>');

		var tick = new Date(this.start);
		while (tick.getTime() <= this.end.getTime()) {
			var hour = tick.getUTCHours();

			var $time = $('<time/>')
				.attr('datetime', tick.toISOString())
				.text(this.format.hours(hour === 24 ? 0 : hour));
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
		// Sort the events by time ascending so that the gap between each two of
		// them may be determined in a cycle.
		var events = this.events.sort($.proxy(function(a, b) {
			return a.start.getTime() - b.start.getTime();
		}, this));
		$.each(this.getLocations(), $.proxy(function(i, location) {
			var $li = $('<li class="sked-tape__event-row"/>')
				.data('locationId', location.id)
				.appendTo(this.$timeline);
			// Render events
			var intersections = this.getIntersections(location.id);
			var lastEndTime = 0, lastEnd;
			events.forEach(function(event) {
				var belongs = event.location == location.id;
				var visible = event.end > this.start && event.start < this.end;
				if (belongs && visible) {
					var intersects = false;
					$.each(intersections, $.proxy(function(i, intersection) {
						$.each(intersection.events, function(j, jEvent) {
							if (jEvent.id == event.id) {
								intersects = true;
								return false;
							}
						});
						if (intersects) return false;
					}, this));
					var gap = event.start.getTime() - lastEndTime;
					if (gap >= this.minGapTime && gap <= this.maxGapTime && !intersects) {
						$li.append(this.renderGap(gap, lastEnd, event.start));
					}
					lastEnd = event.end;
					lastEndTime = lastEnd.getTime();
					var $event = this.renderEvent(event).appendTo($li);
					if (this.minGapHiTime !== false && gap < this.minGapHiTime) {
						$li.children('.sked-tape__event')
							.filter(':eq(-1), :eq(-2)')
							.addClass('sked-tape__event--low-gap');
					}
					else if (intersects) {
						$event.addClass('sked-tape__event--low-gap');
					}
				}
			}, this);
		}, this));
		this.renderIntersections();
		return this.$timeline;
	},
	renderIntersections: function() {
		// Remove the stale ones
		this.$timeline.find('.sked-tape__intersection').remove();
		// Render the new ones
		this.$timeline.find('.sked-tape__event-row').each($.proxy(function(i, row) {
			var $row = $(row);
			var locationId = $row.data('locationId');
			var intersections = this.getIntersections(locationId);
			$.each(intersections, $.proxy(function(i, intersection) {
				if (intersection.end > this.start && intersection.start < this.end) {
					$('<div class="sked-tape__intersection"/>')
						.css({
							width: this.computeEventWidth(intersection),
							left: this.computeEventOffset(intersection)
						})
						.data('events', intersection.events)
						.appendTo($row);
				}
			}, this));
		}, this));
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
	updateDummyEvent: function() {
		if (!this.isAdding()) {
			// Remove its node from the timline
			if (this.$dummyEvent) {
				this.$dummyEvent.remove();
				delete this.$dummyEvent;
			}
			return;
		}
		// Create the event if it doesn't exist
		var event = this.dummyEvent;
		if (!this.$dummyEvent) {
			this.$dummyEvent = $('<div/>');
		}
		// Apply the className, attributes and styles
		this.$dummyEvent[0].className = 'sked-tape__dummy-event ' + (event.className || '');
		this.$dummyEvent
			.css({
				width: this.computeEventWidth(event),
				left: this.computeEventOffset(event)
			})
			.attr({
				'data-start': this.format.time(event.start),
				'data-end': this.format.time(event.end)
			});
		// Append to an appropriate location dom node
		var $location = this.$dummyEvent.closest('.sked-tape__event-row');
		if (!$location.length || $location.data('locationId') != event.location) {
			this.$el.find('.sked-tape__event-row').each(function() {
				if ($(this).data('locationId') == event.location) {
					$location = $(this);
					return false;
				}
			});
			this.$dummyEvent.remove().appendTo($location);
		}
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
		if (event.className) {
			$event.addClass(event.className);
		}
		$event
			.toggleClass('sked-tape__event--disabled', !!event.disabled)
			.toggleClass('sked-tape__event--active', !!event.active)
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
				html += '<br>' + this.format.time(event.start)
					+ ' - ' + this.format.time(event.end);
			}
			if (this.showEventDuration) {
				html += '<br>' + this.format.duration(event.start, event.end);
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
		var now = new Date().getTime() + this.tzOffset * MS_PER_MINUTE;
		var start = this.start.getTime();
		var end = this.end.getTime();
		if (now >= start && now <= end) {
			var offset = 100 * (now - start) / (end - start) + '%';
			this.$timeIndicator.show().css('left', offset);
		} else {
			this.$timeIndicator.hide();
		}
	},
	/**
	 * Returns event intersection list for a specified location.
	 */
	getIntersections: function(location) {
		var intersections = [];
		var occupied = function(intersection) {
			for (var i = 0; i < intersections.length; ++i) {
				if (intersection.start.getTime() == intersections[i].start.getTime() &&
					intersection.end.getTime() == intersections[i].end.getTime()) {
					return true;
				}
			}
			return false;
		};
		$.each(this.events, $.proxy(function(i, iEvent) {
			if (iEvent.location != location) {
				return; // Skip all the events of the other locations
			}
			for (var j = i + 1; j < this.events.length; ++j) {
				var jEvent = this.events[j];
				if (jEvent.location != location) {
					continue; // Skip all the events of the other locations
				}
				var intersection = findIntersection(iEvent, jEvent);
				if (intersection && !occupied(intersection)) {
					// Intersection found and the exact time
					// is unique (for rendering optimization purposes)
					intersection.events = [iEvent, jEvent];
					intersections.push(intersection);
				}
			}
		}, this));
		return intersections;
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
			var bodyClass = TWBS_MAJOR >= 4 ? 'body' : 'content';
			var template = '<div class="popover" role="tooltip">' +
				'<div class="arrow"></div>' +
				'<div class="popover-' + bodyClass + '"></div>' +
			'</div>';
			this.$el.find('.sked-tape__event').each(function() {
				var $entry = $(this);
				if ($entry.width() >= $entry.data('min-width')) return;
				if ($.fn.popover) {
					$entry.popover({
						trigger: 'hover',
						content: $entry.find('.sked-tape__center').html(),
						html: true,
						template: template,
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
	updateUnlessOption: function(opts) {
		return (this.$timeline && (!opts || opts.update)) ? this.update() : this;
	},
	findEventsAtTime(date, locationId) {
		var time = date.getTime();
		var events = [];
		$.each(this.getEvents(), function(i, event) {
			if (event.location == locationId &&
				event.start.getTime() <= time && event.end.getTime() >= time) {
				events.push(event);
			}
		});
		return events;
	},
	pick: function(e) {
		var scalar = (e.pageX - this.$timeline.offset().left) / this.$timeline.width();
		var time = this.start.getTime() + scalar * (this.end.getTime() - this.start.getTime());
		var locationId;
		this.$el.find('.sked-tape__event-row').each(function() {
			var top = $(this).offset().top;
			var bottom = top + $(this).height();
			if (e.pageY >= top && e.pageY <= bottom) {
				locationId = $(this).data('locationId');
				return false;
			}
		});
		return {
			locationId: locationId,
			date: new Date(Math.round(time))
		};
	},
	makeMouseEvent: function(type, e, props) {
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
			detail: $.extend(this.pick(e), props.detail)
		}));
	},
	handleEventClick: function(e) {
		var eventId = $(e.currentTarget).data('eventId');
		var event = this.getEvent(eventId);
		if (this.isEditMode()) {
			// Skip if some event is being dragged right now
			if (this.isAdding()) return;
			// Make sure the event is allowed to be draggable
			var canDragEvent = typeof this.canDragEvent === 'function'
				? this.canDragEvent(event)
				: this.canDragEvent;
			if (canDragEvent) {
				// Remove it from the timeline and begin positioning
				this.removeEvent(eventId);
				this.startAdding({
					name: event.name,
					duration: event.end.getTime() - event.start.getTime(),
					userData: $.extend({}, event.userData || {}),
					draggedEvent: event
				});
			}
		} else {
			// Emit event click event
			var jqEvent = this.makeMouseEvent('skedtape:event:click', e, {
				detail: { component: this, event: event }
			});
			this.$el.trigger(jqEvent, [this]);
		}
	},
	handleEventContextMenu: function(e) {
		e.preventDefault();
		if (this.rmbCancelsAdding && this.isAdding()) {
			return this.cancelAdding();
		}
		var eventId = $(e.currentTarget).data('eventId');
		var event = this.getEvent(eventId);
		var jqEvent = this.makeMouseEvent('skedtape:event:contextmenu', e, {
			detail: { component: this, event: event }
		});
		this.$el.trigger(jqEvent, [this]);
	},
	handleIntersectionClick: function(e) {
		var jqEvent = this.makeMouseEvent('skedtape:intersection:click', e, {
			detail: { component: this }
		});
		var detail = jqEvent.detail;
		detail.events = this.findEventsAtTime(detail.date, detail.locationId);
		this.$el.trigger(jqEvent, [this]);
	},
	handleIntersectionContextMenu: function(e) {
		e.preventDefault();
		if (this.rmbCancelsAdding && this.isAdding()) {
			return this.cancelAdding();
		}
		var jqEvent = this.makeMouseEvent('skedtape:intersection:contextmenu', e, {
			detail: { component: this }
		});
		var detail = jqEvent.detail;
		detail.events = this.findEventsAtTime(detail.date, detail.locationId);
		this.$el.trigger(jqEvent, [this]);
	},
	completeAdding: function(e) {
		// Emit the event coming before actual addition
		var event = this.dummyEvent;
		var jqEvent = this.makeMouseEvent('skedtape:event:add', e, {
			detail: { component: this, event: event }
		});
		this.$el.trigger(jqEvent, [this]);
		// Add event if the operation hasn't been canceled by any event handler
		if (!jqEvent.isDefaultPrevented()) {
			try {
				var newEvent = this.addEvent(event);
				delete event.duration;
				delete this.dummyEvent;
				this.$dummyEvent.remove();
				delete this.$dummyEvent;
				var jqEvent = this.makeMouseEvent('skedtape:event:added', e, {
					detail: { component: this, event: newEvent }
				});
				this.$el.trigger(jqEvent, [this]);
				this.rerenderLocations();
			}
			catch (e) {
				if (e.name !== 'SkedTape.CollisionError') {
					throw e;
				}
				var jqEvent = this.makeMouseEvent('skedtape:event:refused', e, {
					detail: { component: this, event: event }
				});
				this.$el.trigger(jqEvent, [this]);
			}
		}
	},
	handleTimelineClick: function(e) {
		if (eventFromEvent(e)) return;
		if (this.isAdding()) {
			return this.completeAdding(e);
		}
		var jqEvent = this.makeMouseEvent('skedtape:timeline:click', e, {
			detail: { component: this }
		});
		this.$el.trigger(jqEvent, [this]);
	},
	handleTimelineContextMenu: function(e) {
		if (eventFromEvent(e)) return;
		e.preventDefault();
		if (this.rmbCancelsAdding && this.isAdding()) {
			return this.cancelAdding();
		}
		var jqEvent = this.makeMouseEvent('skedtape:timeline:contextmenu', e, {
			detail: { component: this }
		});
		this.$el.trigger(jqEvent, [this]);
	},
	moveDummyEvent: function(picked) {
		var event = this.dummyEvent;
		var start = picked.date;
		if (this.snapToMins) {
			var hr = floorHours(start);
			var left = (start.getTime() - hr.getTime()) / MS_PER_MINUTE;
			var lower = Math.floor(left / this.snapToMins) * this.snapToMins;
			var min = left - lower < this.snapToMins / 2 ? lower : lower + this.snapToMins;
			start = new Date(hr.getTime() + Math.round(min * MS_PER_MINUTE));
		}
		$.extend(event, {
			start: start,
			end: new Date(start.getTime() + event.duration)
		});
		if (picked.locationId) {
			var location = this.getLocation(picked.locationId);
			if (this.canAddIntoLocation(location, event)) {
				event.location = picked.locationId;
			}
		}
	},
	handleMouseMove: function(e) {
		this.lastPicked = this.pick(e);
		if (!this.isAdding()) return;
		this.moveDummyEvent(this.lastPicked);
		this.updateDummyEvent();
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
			if (e.originalEvent.deltaY < 0) {
				this.zoomIn();
			} else {
				this.zoomOut();
			}
			return false;
		} else if (!e.shiftKey && this.scrollWithYWheel) {
			var delta = e.originalEvent.deltaY > 0 ? 1 : -1;
			delta *= this.$frame.width() * 0.9;
			if (this.$frame.queue().length) {
				var scrollLeft = this.$frame.scrollLeft();
				delta += this.$frame.finish().scrollLeft() - scrollLeft;
				this.$frame.scrollLeft(scrollLeft);
			}
			this.$frame.animate({ scrollLeft: '+=' + delta }, 200);
			return false;
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
var SHORT_DURATION = 2 * MS_PER_HOUR - 1; // < this ? .sked-tape__date--short

function eventFromEvent(e) {
	return !!$(e.target).closest('.sked-tape__event, .sked-tape__intersection').length;
}
function isValidTimeRange(start, end) {
	var correctTypes = start instanceof Date && end instanceof Date;
	var correctOrder = start <= end;
	return correctTypes && correctOrder;
}
function getDurationHours(start, end) {
	return (end.getTime() - start.getTime()) / 1000 / 60 / 60;
}
function getMsFromMidnight(d) {
	var secs = d.getUTCHours()*60*60 + d.getUTCMinutes()*60 + d.getUTCSeconds();
	return secs * 1000 + d.getUTCMilliseconds();
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
    floor.setUTCHours(date.getUTCHours(), 0, 0, 0);
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
			delete objOpts.deferRender;
            obj = new SkedTape(objOpts);
			opts.start && opts.end && obj.setTimespan(opts.start, opts.end, {update: false});
			opts.locations && obj.setLocations(opts.locations, {update: false});
			opts.events && obj.setEvents(opts.events, {update: false, allowCollisions: true});
			$(this).data($.fn.skedTape.dataKey, obj);
			opts.deferRender || obj.render();
        } else if (cmd) {
            switch (cmd) {
                case 'destroy':
                    obj.destroy();
                    $(this).removeData($.fn.skedTape.dataKey).remove();
					break;
				default:
					var methods = [
						'addEvent',  'addEvents', 'removeEvent', 'setEvents',
						'removeAllEvents', 'enterEditMode', 'leaveEditMode',
						'startAdding', 'cancelAdding', 'setLocations',
						'addLocation', 'addLocations', 'removeLocation',
						'setTimespan', 'setDate', 'zoomIn', 'zoomOut', 'setZoom',
						'resetZoom', 'render'
					];
					if (methods.indexOf(cmd) >= 0) {
                    	obj[cmd].apply(obj, args);
					} else {
						throw new Error('SkedTape plugin cannot recognize command');
					}
            }
        } else {
            throw new Error('SkedType plugin has been initialized yet');
        }
    });
};

function findIntersection(a, b) {
    var min = a.start < b.start  ? a : b;
    var max = min == a ? b : a;

    //min ends before max starts -> no intersection
    if (min.end < max.start) {
		return null;
	}

    return {
		start: max.start ,
		end: min.end < max.end ? min.end : max.end
	};
}

$.fn.skedTape.dataKey = 'sked-tape';
$.fn.skedTape.format = SkedTape.defaultFormatters;

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
	maxGapTime: 60 * MS_PER_MINUTE - 1,
	/**
	 * Minimum gap to DO NOT highlight adjacent entries.
	 */
	minGapHiTime: false,
	/**
	 * Enables horizontal timeline scrolling with vertical mouse wheel.
	 */
	scrollWithYWheel: false,
	/**
	 * Enables sorting of locations.
	 */
	sorting: false,
	/**
	 * Specifies sorting columns. The property accepts two possible values:
	 * 'order' (sorting by the property 'order' provided in location objects)
	 * or 'name' (locale-aware case insensitive comparison by name).
	 */
	orderBy: 'order',
	/**
	 * The number of minutes the dummy event will be snapped to. To
	 * disable snapping set any falsy value.
	 */
	snapToMins: 1,
	/**
	 * Right Mouse Button cancels adding a new event.
	 */
	rmbCancelsAdding: true,
	/**
	 * The callback executed to determine whether an event can be added to
	 * some location while in visual adding mode.
	 */
	canAddIntoLocation: function(location, event) { return true; },
	/**
	 * The mixin applied to every location DOM element when rendering the sidebar.
	 * The callback takes 3 arguments: jQuery text element node representing
	 * the location, the corresponding location object and a boolean value
	 * specified the result of executing the `canAddIntoLocation()` function on
	 * the location and dummy event. Note, the function is designed to
	 * render some feedback in visual adding mode and is not called out of the
	 * context.
	 */
	postRenderLocation: function($el, location, canAdd) {
		SkedTape.prototype.postRenderLocation.call(this, $el, location, canAdd);
	},
	/**
	 * The callback that may disallow dragging an event while in edit mode.
	 */
	canDragEvent: function(event) { return true; }
};

$.skedTape = function(opts) {
	return $('<div/>').skedTape($.extend(opts || {}, {deferRender: true}));
};

}(jQuery));
