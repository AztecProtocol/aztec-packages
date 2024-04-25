import { expect } from 'chai';
import { UserData } from '../../src/ec2/userdata';
import { ActionConfig } from '../../src/config/config';

describe('Userdata tests', () => {     
    const config = new ActionConfig()
    const userData = new UserData(config); 

    it('get latest runner release version', async () => { 
        const userdata = await userData.getUserData()        
        expect(userdata).is.string;
        expect(userdata.length).to.greaterThan(0);        
    });
});