import assert from 'node:assert/strict';
import {test} from 'node:test';
import {groupCitationsByPlate,countViolations} from '../src/utils/plateCitationGroups.js';

test('two citation records share one visible vehicle without merging citation identities',()=>{
 const rows=[{id:26,ticket_number:'001',plate_number:'12345MV',violations:[{violation_name:'Reckless Driving'},{violation_name:'Overloading'}]},
 {id:27,ticket_number:'002',plate_number:'12345MV',violations:[{violation_name:'No permit'}]}];
 const groups=groupCitationsByPlate(rows);
 assert.equal(groups.length,1);assert.equal(groups[0].plate,'12345MV');
 assert.equal(groups[0].citations.length,2);assert.equal(countViolations(groups[0].citations),3);
 assert.deepEqual(groups[0].citations.map(x=>x.ticket_number),['001','002']);
 assert.notEqual(groups[0].citations[0],groups[0].citations[1]);
 assert.deepEqual(rows.map(x=>x.id),[26,27]);
});
test('normalizes whitespace and hyphens but never merges unknown plates',()=>{
 const groups=groupCitationsByPlate([{plate_number:'AB 1234',ticket_number:'1'},{plate_number:'ab-1234',ticket_number:'2'},{plate_number:'',ticket_number:'3'},{plate_number:null,ticket_number:'4'}]);
 assert.equal(groups.length,3);assert.equal(groups[0].citations.length,2);
 assert.equal(groups[1].citations.length,1);assert.equal(groups[2].citations.length,1);
});
