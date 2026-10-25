jest.mock('express-rate-limit',()=>jest.fn(options=>Object.assign((_req,_res,next)=>next(),{options})));
jest.mock('redis',()=>({createClient:jest.fn()}));
jest.mock('rate-limit-redis',()=>({RedisStore:jest.fn().mockImplementation(function(options){this.options=options;this.incrementScriptSha=options.sendCommand('SCRIPT','LOAD','increment');this.getScriptSha=options.sendCommand('SCRIPT','LOAD','get');})}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),error:jest.fn(),warn:jest.fn(),security:jest.fn()}));
const {EventEmitter}=require('events');
describe('distributed rate limiter availability',()=>{
  const original={NODE_ENV:process.env.NODE_ENV,REDIS_URL:process.env.REDIS_URL};
  afterEach(()=>{for(const [key,value]of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}jest.resetModules();});
  test('production fails closed and consumes Redis startup errors without unhandled rejections',async()=>{
    process.env.NODE_ENV='production';process.env.REDIS_URL='redis://unavailable.test';
    const client=new EventEmitter();Object.assign(client,{isOpen:true,isReady:false,connect:jest.fn().mockResolvedValue(true),sendCommand:jest.fn(),disconnect:jest.fn().mockResolvedValue(),quit:jest.fn().mockResolvedValue()});
    require('redis').createClient.mockReturnValue(client);
    const limiter=require('../rateLimit');
    expect(limiter.options.passOnStoreError).toBe(false);expect(limiter.authLimiter.options.passOnStoreError).toBe(false);
    expect(()=>client.emit('error',new Error('unavailable'))).not.toThrow();
    await expect(limiter.options.store.options.sendCommand('INCR','key')).rejects.toThrow('unavailable');
    client.isReady=true;client.sendCommand.mockResolvedValue('ok');expect(await limiter.options.store.options.sendCommand('PING')).toBe('ok');
    client.isReady=false;await limiter.cleanup();expect(client.disconnect).toHaveBeenCalled();
  });
});
