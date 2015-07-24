'use strict'

var filter = require('lodash.filter')
var map = require('lodash.map')
var forEach = require('lodash.foreach')

var keyPrefix = 'reduxPersistStore:'

function persistStore(store, config, cb){
  //defaults
  config = config || {}
  var blacklist = config.blacklist || []
  var actionCreator = config.actionCreator || defaultActionCreator
  var storage = config.storage || defaultStorage

  //initialize values
  let timeIterator = null
  let lastState = store.getState()

  //rehydrate
  let restoreCount = 0
  let completionCount = 0
  forEach(lastState, function(s, key){
    if(blacklist.indexOf(key) !== -1){ return }
    restoreCount += 1
    setImmediate(function(){
      rehydrate(key, function(){
        completionCount += 1
        if(completionCount === restoreCount){
          cb && cb()
        }
      })
    })
  })

  //store state to disk
  var unsub = store.subscribe(function(){
    //Clear unfinished timeIterator if exists
    if(timeIterator !== null){
      clearInterval(timeIterator)
    }

    let state = store.getState()
    let storesToProcess = filter(map(state, function(subState, key){
      if(blacklist.indexOf(key) !== -1){ return }
      //only store keys that have changed
      return lastState[key] !== state[key] ? key : false
    }))

    //time iterator runs every 33ms (30fps)
    let i = 0
    timeIterator = setInterval(function(){
      if(i === storesToProcess.length){
        clearInterval(timeIterator)
        return
      }
      storage.setItem(createStorageKey(storesToProcess[i]), JSON.stringify(state[storesToProcess[i]]), warnIfSetError)
      i += 1
    }, 33)

    lastState = state
  })

  function rehydrate(key, cb){
    storage.getItem(createStorageKey(key), function(err, serialized){
      try{
        if(err){ throw err }
        let data = JSON.parse(serialized)
        store.dispatch(actionCreator(key, data))
      }
      catch(e){
        console.warn('Error restoring data for key:', key, e)
        storage.removeItem(key, warnIfRemoveError)
      }
      cb()
    })
  }

  return {
    purge: function(keys){
      forEach(keys, function(key){
        storage.removeItem(createStorageKey(key), warnIfRemoveError)
      })
    },
    purgeAll: function(){
      storage.getAllKeys(function(err, keys){
        forEach(keys, function(key){
          if(key.indexOf(keyPrefix) === 0){
            storage.removeItem(key, warnIfRemoveError)
          }
        })
      })
    }
  }
}

function warnIfRemoveError(err){
  if(err){ console.warn('Error removing data for key:', key, err) }
}

function warnIfSetError(err){
  if(err){ console.warn('Error storing data for key:', key, err) }
}

function createStorageKey(key){
  return keyPrefix+key
}

function defaultActionCreator(key, data){
  return {
    type: 'REHYDRATE',
    reducer: key,
    data: data,
  }
}

var defaultStorage = {
  getItem: function(key, cb){
    try{
      var s = localStorage.getItem(key)
      cb(null, s)
    }
    catch(e){
      cb(e)
    }
  },
  setItem: function(key, string, cb){
    try{
      localStorage.setItem(key, string)
      cb(null)
    }
    catch(e){
      cb(e)
    }
  },
  removeItem: function(key, cb){
    try{
      localStorage.removeItem(key)
      cb(null)
    }
    catch(e){
      cb(e)
    }
  },
  getAllKeys: function(cb){
    try{
      var keys = []
      for ( var i = 0, len = localStorage.length; i < len; ++i ) {
        keys.push(localStorage.key(i))
      }
      cb(null, keys)
    }
    catch(e){
      cb(err)
    }
  }
}

module.exports = persistStore
