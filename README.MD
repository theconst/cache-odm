## ODM for intersystems Caché

Object document mapping for intersystems Caché database.
Write node.js code just like you would write ObjectScript.

## Current status

Alpha quality

Check out the example below.

```javascript
const Persistent = require('../js/Persistent');
const Session = require('../js/Session');
const Reader = require('../js/Reader');
const ft = require('../js/functools');

require('console.table');

const log = require('../js/logger');
log.level = 'info';

const aviationDescription = {
    namespace: 'Aviation',
};

class Crew extends Persistent {};
Crew.description = aviationDescription;

class Aircraft extends Persistent {};
Aircraft.description = aviationDescription;

const eventId = '20010608X01122';
const aircraftKey = 1;
const crewNumber = 1;

const id = {
    'EventId': eventId,
    'AircraftKey': aircraftKey,
    'CrewNumber': crewNumber,
};

Session.transact(() => 
    Crew.openId(id)
    .tap(result => {
        console.table(result);
        console.log('updating incident info');
    })
    .flatMap(result => {
        const injury = result.Injury;
        result.Injury = injury === 'fatal' ? 'critical' : 'fatal';

        return result.save();
    })
).then(() => 
    Session.transact(() => 
        Crew.openId(id)
        .tap(result => {
            console.table(result);
            console.log('incident info updated');
        }) 
    )
).then(() => 
    Session.transact(() => 
        Crew.findBy({
            'Injury': 'fatal',
            'Category': 'Co-Pilot',
            'Sex': 'M',
        }, ['Age', 'Sex', 'Aircraft'])
        .tap(deadMaleCoPilots => {
            console.log('Dead male copilots');
            console.table(deadMaleCoPilots);
        })
        .flatMap(deadMaleCoPilots => 
            Reader.sequence(deadMaleCoPilots
                .filter(copilot => copilot.Age < 30)
                .map(copilot => copilot.Aircraft)
                .map(aircraftId => Aircraft.findBy({
                    'ID': aircraftId
                }, ['ID', 'AircraftModel'])
                .tap(aircraftId => {
                    console.log('Found aircraft id');
                    console.table(aircraftId);
                }))))
        .map(airplanes => ft.flat(airplanes))
        .tap(airplanes => {
            console.log('Result of search');
            console.table(airplanes);
        }))
).then(() => 
    Session.exec(() => Aircraft.call('Extent'))
        .tap(result => {
            console.log(`Called Aircarft's Extent classmethod`);
            console.table(result.slice(0, 10));
        })
).finally(() => Session.destroy());
```


## Current Status

See the https://github.com/theconst/aodbc for configuration details.
Work in progress. Not ready for use as a standalone module.

## Configuration

Change configuration options in config.json 

|Option            | Descritpion                        |
|------------------|------------------------------------|
| dsn              | DSN for ODBC connection to use     |
| poolSizeMin      | Minimum size of connection pool    |
| poolSizeMax      | Maximum size of connection pool    |
| cacheSize        | Size of query cache per connection |
| evictionInterval | Connection pool eviction interval  |