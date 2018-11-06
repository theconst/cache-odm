const odm = require('../index')({
    "dsn": "DSN=CacheWinHost",
});

const Persistent = odm.Persistent;
const Session = odm.Session;
const Reader = odm.Reader;
const ft = odm.functools;

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
