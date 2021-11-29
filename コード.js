/*---- 初期設定 ----*/
var CHATWORK_TOKEN = PropertiesService.getScriptProperties().getProperty("chatwork_token");
var TASKLIST_ID = PropertiesService.getScriptProperties().getProperty("tasklist_id");


//Google TasksのTaskList IDを取得
function getGoogleTasksListId() {
  const tasklist = Tasks.Tasklists.list().items;
  for(let i = 0; i < tasklist.length; i++){
    const name = tasklist[i].title;
    const Id = tasklist[i].getId();
    console.log('name: %s, Id: %s', name, Id);
  }
}


//Google TasksのTaskList IDを取得
function getGoogleTasks(showCompleted=true) {
  let minDate = new Date();
  let year = minDate.getFullYear();
  minDate.setFullYear(minDate.getFullYear() - 1);
  minDate = Utilities.formatDate(minDate, "JST", "yyyy-MM-dd'T'HH:mm:ss.SXXX")
  
  const option = {showCompleted: showCompleted, showHidden: showCompleted, maxResults: 100, dueMin: minDate};
  let result = {};
  
  const tasklists = Tasks.Tasklists.list().items;
  for(let i = 0; i < tasklists.length; i++){
    const taskListId = tasklists[i].getId();

    do{
      const tasklist = Tasks.Tasks.list(taskListId, option);
      const tasks = tasklist.getItems();
      
      var nextPageToken = tasklist.nextPageToken;
      option["pageToken"] = nextPageToken;
      
      if (tasks) {
        for(let i = 0; i < tasks.length; i++){
          const name = tasks[i].getTitle();
          const google_id = tasks[i].getId();
          const note = tasks[i].getNotes();
          const status = tasks[i].getStatus();
          try{
            const object = JSON.parse(note);
            result[object.task_id] = {
              chatwork_task: object, 
              status: status, 
              google_tasks_id: google_id
            };
          }catch(e){
            continue
          }
        }
      }else{
        console.log('No tasks found.');
        return false;
      }
    }
    while(nextPageToken !== undefined);
  }
  console.log(result);
  return result;
}



/*---- Chatwork task to Google tasks ----*/
function getChateorkTasks(){  
  // ChatWork apiに投げるパラメータを設定
  var params = {
    headers : {"X-ChatWorkToken" : CHATWORK_TOKEN},
    method : "get"
  };
  
  //未完了のタスクを取得するURL
  var url = "https://api.chatwork.com/v2/my/tasks?status=open";

  //チャットワークAPIエンドポイントからレスポンスを取得
  var strRespons = UrlFetchApp.fetch(url, params);

  //レスポンスがない場合は終了
  if(strRespons == "") {return false};

  //レスポンス文字列をJSON形式として解析しJSONオブジェクトとして返す
  var json = JSON.parse(strRespons.getContentText());
  
  return json;
}


function updateChateorkTasks(room_id, task_id){  
  // ChatWork apiに投げるパラメータを設定
  var data = {
    'body': "done"
  };
  var params = {
    'headers' : {"X-ChatWorkToken" : CHATWORK_TOKEN, 'Content-Type' : 'application/json'},
    'method' : "put",
    'payload': data,
    'muteHttpExceptions': true
  };
  
  //未完了のタスクを取得するURL
  var url = "https://api.chatwork.com/v2/rooms/" + room_id + "/tasks/" + task_id + "/status";
  
  console.log(url, params);
  //チャットワークAPIエンドポイントからレスポンスを取得
  var strRespons = UrlFetchApp.fetch(url, params);

  //レスポンスがない場合は終了
  if(strRespons == "") {
    console.log({method: arguments.callee.name, status: "false", result: strRespons.getContentText()});
    return false
  };
  console.log({method: arguments.callee.name, status: "success", result: strRespons.getContentText()});
}


function validateTasks(validTasks, Task) {
  if(validTasks[Task.task_id]){
    return false;
  }else{
    return true;
  }
}


function createGoogleTasks() {
  const json = getChateorkTasks();
  const validTasks = getGoogleTasks();

  // タスク毎に予定を作成
  json.forEach(function(obj) {
    if(validateTasks(validTasks, obj)){
      
      // タイトルを設定
      let title = obj.body;
      title = title.split(String.fromCharCode(10)).join(' '); // 改行をスペースに置換
      title = title.replace(/\[/g, "<"); // chatworkのタグを "[" → "<" に変換
      title = title.replace(/\]/g, ">"); // chatworkのタグを "]" → ">" に変換
      title = title.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, ""); // タグを削除
      title = title.substring(0,50); // タイトルは50文字で切る
      
      // 期限のないタスクの場合はログを残してスキップ
      if( obj.limit_time !== 0 ){
        
        // UNIXTIMEを変換してdateにセット
        var date = Utilities.formatDate(new Date(), "JST", "yyyy-MM-dd'T'HH:mm:ss.SXXX"); 
        
        // 説明欄を設定
        var description = {};
        description["body"] = obj.body;
        description["room_id"] = obj.room.room_id; // ルームID
        description["task_id"] = obj.task_id;
        
        // 終日のイベントを作成
        var task = {
          title: title,
          notes: JSON.stringify(description),
          due: date
        };
        task = Tasks.Tasks.insert(task, TASKLIST_ID);
        Logger.log('Task with ID "%s" was created.', task.id);
      }
    }
  });
}


function convertCompletedTasks() {
  const googleTasks = getGoogleTasks();
  
  for(let key in googleTasks) {
    if(googleTasks[key].status === 'completed') {
      const room_id = googleTasks[key].chatwork_task.room_id;
      const task_id = googleTasks[key].chatwork_task.task_id;
      updateChateorkTasks(room_id, task_id);
    }
  }
  console.log({method: arguments.callee.name, status: "success"});
}