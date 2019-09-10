# jquery-sked-tape
Schedule component for jQuery that represents events in tape manner.

[DEMO](https://lexkrstn.github.io/jquery-sked-tape/)

### API

#### Initialization

Usually it looks like:
```javascript
var $sked = $('#sked').skedTape({
    caption: 'Cities',
    start: yesterday(22, 0), // Timeline starts this date-time (UTC)
    end: today(12, 0),       // Timeline ends this date-time (UTC)
    showEventTime: true,     // Whether to show event start-end time
    showEventDuration: true, // Whether to show event duration
    locations: [
        {id: 1, name: 'San Francisco'}, // required properties only
        {
            id: 'london',
            name: 'Sydney',
            order: 1, // optional sorting order
            tzOffset: -10 * 60, // individual timezone (notice that minus sign)
            userData: {...} // optional some custom data to store
        },
        ...
    ],
    events: [
        {
            name: 'Meeting 1',
            location: 'london',
            start: today(4, 15),
            end: today(7, 30)
        },
        // ...
    ]
});
```

**Available constructor options**:
- `locations` (_object_) Maps location-id -> location-name.
- `events` (_Array_) An array of event objects (see description below).
- `start`, `end` (_Date_) Timeline is shown between these date-times.
- `caption` (_string_) The text in left top corner. Default is ''.
- `maxZoom` (_float_) Self-explanatory. Default is 10.
- `zoomStep` (_float_) Zoom up and down increment value. Default is 0.5.
- `zoom` (_float_) Initial zoom level. Minimum possible and default value is 1.
- `showEventTime` (_bool_) Whether to show from-to dates in entries. Default is false.
- `showEventDuration` (_bool_) Whether to show duration in entries. Default is false.
- `showDates` (_bool_) Whether to show dates bar. Default is false.
- `minGapTime` (_int_) Minimum gap between entries to show minutes in milliseconds. Default is 1min. 
- `maxGapTime` (_int_) Maximum gap between entries to show minutes in milliseconds. Default is 30min.
- `minGapHiTime` (_int|false_) Minimum gap to DO NOT highlight adjacent entries in milliseconds. Default is false.
- `formatters` (_object_) Custom date/time formatters. See the notes below.
- `scrollWithYWheel` (_bool_) Enables horizontal timeline scrolling with vertical mouse wheel. Default is false.
- `tzOffset` (_int_) The default timezone offset for locations, taking effect when
  you do not specify it in location descriptor. The default value is a browser's
  current timezone offset. Take in mind, that the offset value is negative for
  positive timezones (GMT+N) and positive otherwise (i.e. for Sydney GMT+10 the
  offset would be -600).
- `timeIndicatorSerifs` (_bool_) Enables showing upper and lower serifs on time
  indicator line. Default is false.
- `showIntermission` (_bool_) Enables or disables showing intervals between
  events. Disabled by default.
- `intermissionRange` (_[int, int]_) Interval (in minutes) between events to
  show intermission time when it is enabled. The default value is _[1, 60]_.

**Available event object options**:
- `name` (_string_)
- `location` (_int|string_) Location id (key in locations object).
- `start`, `end` (_Date_)
- `url` (_string_) If set the entry will be rendered as anchor with href=url.
- `className` (_string_) Additional class name for stylizing purposes.
- `disabled` (_bool_) Adds the `sked-tape__event--disabled` class. Default is false.
- `data` (_object_) The data to set with `$.data()` method. The `eventId` is reserved.
- `userData` (_object_) Any custom data you may store here.

#### Events

Plugin-specific event handlers may be added like this:
```javascript
// The following handler fires on clicking on an event:
$sked.on('event:click.skedtape', function(e/*, api*/) {
    $sked.skedTape('removeEvent', e.detail.event.id);
    // api.removeEvent(e.detail.event.id)
    // assert(api === e.detail.component)
});
```

**Available events**:
- `intersection:click.skedtape`
- `intersection:contextmenu.skedtape`
- `timeline:click.skedtape`
- `timeline:contextmenu.skedtape`
- `location:click.tile` Returning location property (id and name)
- `event:click.skedtape` The detail property contains corresponding event object.
- `event:contextmenu.skedtape` The detail property contains corresponding event object.

- `event:dragStart.skedtape`
- `event:dragStarted.skedtape`
- `event:dragEnd.skedtape`
- `event:dragEnded.skedtape`
- `event:dragEndRefused.skedtape`
- `skedtape:event:dragCanceled`
- `skedtape:event:addingCanceled`


**The props in common for all click event/contextmenu events:**
- `detail.locationId`
- `detail.date` Click position converted to datetime on timeline.
- `relatedTarget`
- `pageX, offsetX, etc`

#### Custom date/time formatting

To change the way dates are displayed by plugin there're two cases. You may
fill up the `formatters` property during the constructing of every component.
And also you may change default settings globally, replacing the formatters
within the `$.fn.skedTape.format` object. **ATTENTION** Do not replace the
object itself - it won't work.


#### Hooks

- `canAddIntoLocation(location, event)` Invoked to determine whether an event
  may be added to a location. The default implementation always returns *true*.
  You should avoid mutating the arguments in this hook (that may cause
  unexpected behaviour).
- `beforeAddIntoLocation(location, event)` Invoked after getting a positive
  result from the `canAddIntoLocation()` hook just before updating the event.
  Here you can place any logic that mutates the event object given.
- `postRenderLocation($el, location, canAdd)` The mixin is applied to every
  location's DOM element when rendering the sidebar. he callback takes 3
  arguments: 
  - *$el* - jQuery text element node representing the location
  - *location* - the corresponding location object
  - *canAdd* - the result of executing the `canAddIntoLocation()` function.
	The value is undefined if the function is called while no event is being
    dragged.
- `postRenderEvent($el, event)` The mixin applied to every event DOM element
  on the timeline after rendering is complete and before actual inserting to the
  DOM tree of the document. The default implementation does nothing, you may feel
  free to replace it with your own code that modifies the default representation
  of events on a timeline.

### Development deploy
1. `npm i -g gulp-cli`
2. `npm i`
3. `gulp build` (AOT) or `gulp` (JIT)
